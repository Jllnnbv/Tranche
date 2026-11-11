import { handle } from "@/lib/http";
import { requireSameOrigin } from "@/lib/tranche/request";
import { clearedSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const response = await handle(async () => {
    requireSameOrigin(request);
    return { signedOut: true };
  });
  if (response.ok) response.headers.append("Set-Cookie", clearedSessionCookie(request));
  return response;
}
