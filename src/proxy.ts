import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

  if (token) {
    return NextResponse.next();
  }

  if (isProtectedApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
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
