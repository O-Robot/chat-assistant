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

  //!for widget
  // if (pathname.startsWith("/widget")) {
  //   const response = NextResponse.next();

  //   const allowedOrigins = [process.env.NEXT_PUBLIC_PORTFOLIO_URL];

  //   const origin = request.headers.get("origin");

  //   if (origin && allowedOrigins.includes(origin)) {
  //     response.headers.set("Access-Control-Allow-Origin", origin);
  //     response.headers.set("Access-Control-Allow-Credentials", "true");
  //     response.headers.set(
  //       "Access-Control-Allow-Methods",
  //       "GET, POST, PUT, DELETE, OPTIONS",
  //     );
  //     response.headers.set(
  //       "Access-Control-Allow-Headers",
  //       "Content-Type, Authorization",
  //     );
  //   }

  //   response.headers.delete("X-Frame-Options");

  //   response.headers.set(
  //     "Content-Security-Policy",
  //     `frame-ancestors 'self' ${allowedOrigins.join(" ")}`,
  //   );

  //   return response;
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
