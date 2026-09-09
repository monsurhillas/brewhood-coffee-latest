import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isSessionExpired } from "@/lib/sessionPolicy";

const PROTECTED_API_PREFIXES = [
  "/api/employees/import",
  "/api/skus",
  "/api/sales",
  "/api/collections",
  "/api/costs",
  "/api/analytics",
  "/api/reports",
  "/api/admin",
  "/api/invoices",
  "/api/bulk-uploads",
  "/api/ocr",
];

// /api/employees itself and /api/employees/:id/transactions are public
// (the homepage directory), but /api/employees/:id/ledger is the
// manager-only full ledger — matched separately since it shares a prefix
// with those public routes.
const EMPLOYEE_LEDGER_PATTERN = /^\/api\/employees\/\d+\/ledger$/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isProtectedApi =
    EMPLOYEE_LEDGER_PATTERN.test(pathname) ||
    PROTECTED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isDashboard && !isProtectedApi) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // `loginTime` is stamped into the token once at sign-in (see
  // src/lib/auth.ts) and never refreshed, so this catches a session that's
  // outlived its fixed lifetime even though the JWT itself hasn't expired
  // yet (NextAuth's own session.maxAge slides forward on every request).
  const expired = !token || isSessionExpired(token.loginTime);

  if (!expired) {
    return NextResponse.next();
  }

  if (isProtectedApi) {
    return NextResponse.json(
      { error: token ? "Your session has expired. Please sign in again." : "Unauthorized" },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  if (token) loginUrl.searchParams.set("error", "SessionExpired");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/api/employees/import",
    "/api/employees/:id/ledger",
    "/api/skus/:path*",
    "/api/sales/:path*",
    "/api/collections/:path*",
    "/api/costs/:path*",
    "/api/analytics/:path*",
    "/api/reports/:path*",
    "/api/admin/:path*",
    "/api/invoices/:path*",
    "/api/bulk-uploads/:path*",
    "/api/ocr/:path*",
  ],
};
