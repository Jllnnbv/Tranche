import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EventItem } from "@/lib/paiflow";

export type ContributionStatus =
  | "PREPARED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "REJECTED"
  | "UNKNOWN"
  | "EXPIRED";
export type Contribution = {
  id: string;
  round: number;
  memberId: string;
  from: string;
  amountStroops: string;
  txHash: string;
  status: ContributionStatus;
  // Unsigned prepared envelope; returned again if the member re-opens Pay.
  xdr: string;
  expiresAt: string;
  preparationRequestId?: string;
  // Exact signed envelope, persisted before submit so retries reuse it. Never returned or logged.
  signedXdr?: string;
  ledger?: number;
  error?: { code: string; message: string };
  // "hosted": paid on Paiflow's trigger page, imported from events after a SUCCESS status check.
  source?: "app" | "hosted";
  createdAt: string;
  updatedAt: string;
};
export type StoredEvent = EventItem & { round: number };
export type ReleaseStatus = "COLLECTING" | "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
export type Release = {
  id: string;
  source: "vault" | "fund";
  // release: a held tranche back to its receiver. forfeit: a late member's held tranche to
  // the round receiver. cover: the Safety Fund pays the round receiver for a missed payment.
  kind?: "release" | "forfeit" | "cover";
  // release: the receiver. forfeit and cover: the member who missed the payment.
  memberId: string;
  round: number;
  destination: string;
  amountStroops: string;
  txHash: string;
  // Envelope with every verified signature collected so far.
  xdr: string;
  signers: string[];
  expiresAt: string;
  status: ReleaseStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
export type State = {
  contributions: Contribution[];
  events: StoredEvent[];
  eventCursors: Record<string, string>;
  releases: Release[];
};

const empty = (): State => ({
  contributions: [],
  events: [],
  eventCursors: {},
  releases: [],
});
const file = () =>
  process.env.AMBAGAN_DATA_FILE ??
  process.env.TRANCHE_DATA_FILE ??
  path.join(process.cwd(), "data", "ledger.json");

// Next builds separate route bundles; share one lock across them in this process.
const processState = globalThis as typeof globalThis & {
  __trancheStoreLock?: Promise<unknown>;
};

async function load(): Promise<State> {
  try {
    return { ...empty(), ...JSON.parse(await readFile(file(), "utf8")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    // Fail closed: never overwrite a ledger we could not parse.
    throw new Error("Ambagan ledger file is unreadable.");
  }
}
async function save(state: State) {
  const target = file();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, target);
}

/** Serialised read-modify-write. Changes are saved only if fn resolves. */
export function withStore<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  const run = (processState.__trancheStoreLock ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const state = await load();
      const result = await fn(state);
      await save(state);
      return result;
    });
  processState.__trancheStoreLock = run;
  return run;
}
export function readStore(): Promise<State> {
  return withStore((state) => structuredClone(state));
}
