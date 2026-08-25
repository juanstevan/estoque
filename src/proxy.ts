import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const session = req.cookies.get("chaleur_session")?.value;
  const { pathname } = req.nextUrl;
  const publicPath =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");
  if (!session && !publicPath) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
