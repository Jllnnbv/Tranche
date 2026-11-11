import { handle } from "@/lib/http";
import { jsonBody, requireSameOrigin } from "@/lib/tranche/request";
import {
  authError,
  checkLoginRate,
  clearLoginFailures,
  email,
  recordLoginFailure,
} from "@/lib/auth/http";
import { authenticate } from "@/lib/auth/users";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  let token: string | null = null;
  const response = await handle(async () => {
    requireSameOrigin(request);
    const body = await jsonBody(request, ["email", "password"]);
    const address = email(body.email);
    checkLoginRate(address);
    const user =
      typeof body.password === "string" && body.password.length <= 200
        ? await authenticate(address, body.password)
        : null;
    if (!user) {
      recordLoginFailure(address);
      throw authError(401, "UNAUTHENTICATED", "Email or password is incorrect.");
    }
    clearLoginFailures(address);
    token = await createSessionToken(user.id);
    return user;
  });
  if (token) response.headers.append("Set-Cookie", sessionCookie(token, request));
  return response;
}
