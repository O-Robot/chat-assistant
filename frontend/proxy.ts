// middleware.ts (Frontend - Root level)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/auth")) {
    const token = request.cookies.get("whoami")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/admin/auth", request.url));
    }
  }

  if (pathname === "/admin/auth") {
    const token = request.cookies.get("whoami")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
