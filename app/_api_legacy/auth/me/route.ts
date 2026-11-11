import { handle } from "@/lib/http";
import { authError, currentUser } from "@/lib/auth/http";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await currentUser(request);
    if (!user) throw authError(401, "UNAUTHENTICATED", "Not signed in.");
    return user;
  });
}
