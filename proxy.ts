import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  if (request.nextUrl.pathname === "/api/v1/webhooks/meta") {
    return NextResponse.next();
  }

  if (request.auth) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication is required.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/crm/:path*",
    "/projects/:path*",
    "/tasks/:path*",
    "/documents/:path*",
    "/quotations/:path*",
    "/finance/:path*",
    "/accounting/:path*",
    "/people/:path*",
    "/targets/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/audit-logs/:path*",
    "/expenses/:path*",
    "/activities/:path*",
    "/search/:path*",
    "/api/v1/:path*",
  ],
};
