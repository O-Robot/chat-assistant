// middleware.ts (Frontend - Root level)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log("Middleware triggered for path:", pathname, request.cookies);
  // Check if accessing admin routes
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/auth")) {
    const token = request.cookies.get("whoami")?.value;

    // If no token, redirect to login
    if (!token) {
      return NextResponse.redirect(new URL("/admin/auth", request.url));
    }
  }

  // If accessing admin auth page with token, redirect to dashboard
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
