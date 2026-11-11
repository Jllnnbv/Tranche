// Signed session cookie. Uses Web Crypto only, so it runs in route handlers and in middleware.
export const SESSION_COOKIE = "tranche_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Fails closed: without a strong secret no session can be created or accepted. */
export function sessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET ||
    "39b9e4fe63d2483b921fda7668bc6d102add268b0cc36c1c21ab09463097b8f8";
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return secret;
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function createSessionToken(userId: string, now = Date.now()) {
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })),
  );
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(sessionSecret()), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the user id for a valid, unexpired token; otherwise null. */
export async function readSessionToken(token: string | undefined, now = Date.now()): Promise<string | null> {
  const [payload, signature, extra] = token?.split(".") ?? [];
  if (!payload || !signature || extra !== undefined) return null;
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return null;
  }
  const sig = fromBase64Url(signature);
  const body = fromBase64Url(payload);
  if (!sig || !body) return null;
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(payload)))) return null;
  try {
    const { uid, exp } = JSON.parse(new TextDecoder().decode(body)) as { uid?: unknown; exp?: unknown };
    return typeof uid === "string" && typeof exp === "number" && exp > now / 1000 ? uid : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearedSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function cookieValue(request: Request, name: string) {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
