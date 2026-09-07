import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { addAdminUser, isTabKey, listAdminUsers, TAB_KEYS } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";

// Super-admin only: the allowlist of who can sign in with Google, and
// which dashboard tabs each of them can see and use.
export async function GET() {
  const { response } = await requireSuperAdmin();
  if (response) return response;

  const users = await listAdminUsers();
  return NextResponse.json({ users, tabKeys: TAB_KEYS });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSuperAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const allowedTabsInput = Array.isArray(body?.allowedTabs) ? body.allowedTabs : [];
  const allowedTabs = allowedTabsInput.filter(isTabKey);
  if (allowedTabs.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one tab this person can access." },
      { status: 400 }
    );
  }

  try {
    const user = await addAdminUser({
      email,
      name: typeof body?.name === "string" ? body.name.trim() || null : null,
      allowedTabs,
      createdBy: session!.user?.email ?? "unknown",
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
