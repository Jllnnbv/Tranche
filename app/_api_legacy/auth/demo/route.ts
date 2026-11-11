import { handle } from "@/lib/http";
import { requireSameOrigin } from "@/lib/tranche/request";
import { getOrCreateDemoUser } from "@/lib/auth/users";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  let token: string | null = null;
  const response = await handle(async () => {
    requireSameOrigin(request);
    const user = await getOrCreateDemoUser();
    token = await createSessionToken(user.id);
    return user;
  });
  if (token) response.headers.append("Set-Cookie", sessionCookie(token, request));
  return response;
}
