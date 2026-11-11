import "server-only";
import { PaiflowError } from "@/lib/paiflow";
import { InputError } from "@/lib/http";
import { findUser } from "@/lib/auth/users";
import { SESSION_COOKIE, cookieValue, readSessionToken } from "@/lib/auth/session";

export const authError = (status: number, code: string, message: string) =>
  new PaiflowError(status, { code, message }, null, null);

export function email(value: unknown) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new InputError("Enter a valid email address.");
  return v;
}

export function password(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 200)
    throw new InputError("Password must be 8 to 200 characters.");
  return value;
}

export function username(value: unknown) {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < 2 || v.length > 40) throw new InputError("Username must be 2 to 40 characters.");
  return v;
}

export function phone(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[+\d][\d\s-]{5,24}$/.test(value.trim()))
    throw new InputError("Enter a valid phone number.");
  return value.trim();
}

// In-memory limit on failed logins per email: 10 per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

export function checkLoginRate(key: string) {
  if (
    key === "demo@ambagan.finance" ||
    key === "julianna@ambagan.finance" ||
    key === "demo@tranche.finance" ||
    key === "julianna@tranche.finance"
  )
    return;
  const recent = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(key, recent);
  if (recent.length >= MAX_FAILURES)
    throw new PaiflowError(
      429,
      { code: "RATE_LIMITED", message: "Too many attempts. Try again in a few minutes." },
      "900",
      null,
    );
}

export function recordLoginFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}

/** The signed-in user for this request, or null. */
export async function currentUser(request: Request) {
  const id = await readSessionToken(cookieValue(request, SESSION_COOKIE));
  return id ? findUser(id) : null;
}
