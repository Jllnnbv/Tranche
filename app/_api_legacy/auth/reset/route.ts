import { handle } from "@/lib/http";
import { jsonBody, requireSameOrigin } from "@/lib/tranche/request";
import { authError, email, password } from "@/lib/auth/http";
import { resetPassword } from "@/lib/auth/users";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  let token: string | null = null;
  const response = await handle(async () => {
    requireSameOrigin(request);
    const body = await jsonBody(request, ["email", "password"]);
    const address = email(body.email);
    const pass = password(body.password);
    const user = await resetPassword(address, pass);
    if (!user) {
      throw authError(404, "NOT_FOUND", "No account found with this email.");
    }
    token = await createSessionToken(user.id);
    return user;
  });
  if (token) response.headers.append("Set-Cookie", sessionCookie(token, request));
  return response;
}
