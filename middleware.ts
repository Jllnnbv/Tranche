import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

// App pages need a signed-in session; login and signup are always accessible.
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = (await readSessionToken(token)) !== null;

  if (pathname === "/login" || pathname === "/signup") {
    if (signedIn && !request.nextUrl.searchParams.get("next")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (signedIn) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/pay/:path*", "/group/:path*", "/contract/:path*", "/verify/:path*", "/login", "/signup"],
};
