import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { TabKey } from "@/lib/adminUsers";

// Defense-in-depth: proxy.ts already blocks unauthenticated requests to
// protected routes, but API route handlers double-check the session before
// touching the database.
export async function requireSession() {
  const session = await getServerSession(authOptions);
  return session;
}

export function hasTabAccess(session: Session | null, tab: TabKey | TabKey[]): boolean {
  if (!session?.user) return false;
  if (session.user.isSuperAdmin) return true;
  const allowed = session.user.allowedTabs ?? [];
  const tabs = Array.isArray(tab) ? tab : [tab];
  return tabs.some((t) => allowed.includes(t));
}

// One-call guard for API routes: `const { session, response } = await
// requireTab("sale"); if (response) return response;` — returns 401 if
// nobody's signed in, 403 if they're signed in but this tab isn't in their
// allowed_tabs (and they're not the super admin), or the live session on
// success. Pass an array to accept any one of several tabs (e.g. a route
// shared by two dashboard sections).
export async function requireTab(tab: TabKey | TabKey[]) {
  const session = await requireSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasTabAccess(session, tab)) {
    return {
      session,
      response: NextResponse.json(
        { error: "You don't have access to this section. Ask your admin for access." },
        { status: 403 }
      ),
    };
  }
  return { session, response: null };
}

export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.user?.isSuperAdmin) {
    return {
      session,
      response: NextResponse.json({ error: "Only the super admin can do this." }, { status: 403 }),
    };
  }
  return { session, response: null };
}
