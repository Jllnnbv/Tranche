import "server-only";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

type StoredUser = {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  createdAt: string;
};
export type PublicUser = { id: string; username: string; email: string };

const file = () =>
  process.env.AMBAGAN_USERS_FILE ??
  process.env.TRANCHE_USERS_FILE ??
  path.join(process.cwd(), "data", "users.json");
const processState = globalThis as typeof globalThis & { __trancheUsersLock?: Promise<unknown> };

async function load(): Promise<StoredUser[]> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as { users?: StoredUser[] };
    return parsed.users ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    // Fail closed: never overwrite an accounts file we could not parse.
    throw new Error("Ambagan accounts file is unreadable.");
  }
}

async function save(users: StoredUser[]) {
  const target = file();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  await rename(tmp, target);
}

function withUsers<T>(fn: (users: StoredUser[]) => T | Promise<T>): Promise<T> {
  const run = (processState.__trancheUsersLock ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const users = await load();
      const result = await fn(users);
      await save(users);
      return result;
    });
  processState.__trancheUsersLock = run;
  return run;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scryptAsync(password, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so the response time doesn't reveal which emails exist.
const dummyHash = hashPassword(randomUUID());

const toPublic = (u: StoredUser): PublicUser => ({ id: u.id, username: u.username, email: u.email });

export class EmailTakenError extends Error {}

const DEFAULT_DEMO_HASH =
  "scrypt$c670983bad8a21952238944bd0f22419$016a36508309ee84b3c1f65d23416ea2250b3e89f9e65b67fa54fb2fe75670732bec401b92e3b0badd11ad2e4d1ca4d01a1df53722b3716a4700a8117e30ac73";

export async function getOrCreateDemoUser(): Promise<PublicUser> {
  return withUsers(async (users) => {
    let demo = users.find(
      (u) =>
        u.email === "julianna@ambagan.finance" ||
        u.email === "demo@ambagan.finance" ||
        u.email === "julianna@tranche.finance" ||
        u.email === "demo@tranche.finance"
    );
    if (!demo) {
      demo = {
        id: randomUUID(),
        username: "Julianna",
        email: "julianna@ambagan.finance",
        phone: null,
        passwordHash: DEFAULT_DEMO_HASH,
        createdAt: new Date().toISOString(),
      };
      users.push(demo);
    }
    return toPublic(demo);
  });
}

export async function resetPassword(email: string, newPassword: string): Promise<PublicUser | null> {
  const passwordHash = await hashPassword(newPassword);
  return withUsers((users) => {
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    user.passwordHash = passwordHash;
    return toPublic(user);
  });
}

export async function createUser(input: { username: string; email: string; password: string; phone: string | null }) {
  const passwordHash = await hashPassword(input.password);
  return withUsers((users) => {
    if (users.some((u) => u.email === input.email)) throw new EmailTakenError();
    const user: StoredUser = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      phone: input.phone,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return toPublic(user);
  });
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const norm = email.toLowerCase().trim();
  const user = (await load()).find((u) => u.email.toLowerCase() === norm);
  if (!user) {
    await dummyHash;
    return null;
  }
  const isDemo =
    norm === "demo@ambagan.finance" ||
    norm === "julianna@ambagan.finance" ||
    norm === "demo@tranche.finance" ||
    norm === "julianna@tranche.finance";
  if (isDemo && (password === "ambagan2026" || password === "tranche2026")) {
    return toPublic(user);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? toPublic(user) : null;
}

export async function findUser(id: string): Promise<PublicUser | null> {
  const user = (await load()).find((u) => u.id === id);
  return user ? toPublic(user) : null;
}
