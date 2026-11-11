import { handle } from "@/lib/http";
import { jsonBody, requireSameOrigin } from "@/lib/tranche/request";
import { authError, email, password, phone, username } from "@/lib/auth/http";
import { EmailTakenError, createUser } from "@/lib/auth/users";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";

// Creates an account and signs it in.
export async function POST(request: Request) {
  let token: string | null = null;
  const response = await handle(async () => {
    requireSameOrigin(request);
    const body = await jsonBody(request, ["username", "email", "password", "phone"]);
    try {
      const user = await createUser({
        username: username(body.username),
        email: email(body.email),
        password: password(body.password),
        phone: phone(body.phone),
      });
      token = await createSessionToken(user.id);
      return user;
    } catch (error) {
      if (error instanceof EmailTakenError)
        throw authError(409, "CONFLICT", "An account with this email already exists. Log in instead.");
      throw error;
    }
  });
  if (token) response.headers.append("Set-Cookie", sessionCookie(token, request));
  return response;
}
