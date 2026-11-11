import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

// App pages need a signed-in session; login and signup are always accessible.
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname === "/signup") {
    return NextResponse.next();
  }
  const signedIn = (await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) !== null;
  if (signedIn) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/pay/:path*", "/group/:path*", "/contract/:path*", "/verify/:path*", "/login", "/signup"],
};
