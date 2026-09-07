import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { deleteAdminUser, isTabKey, updateAdminUser, type TabKey } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSuperAdmin();
  if (response) return response;

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const update: { allowedTabs?: TabKey[]; active?: boolean; name?: string | null } = {};

  if (Array.isArray(body.allowedTabs)) {
    const allowedTabs = body.allowedTabs.filter(isTabKey);
    if (allowedTabs.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one tab this person can access." },
        { status: 400 }
      );
    }
    update.allowedTabs = allowedTabs;
  }
  if (typeof body.active === "boolean") update.active = body.active;
  if ("name" in body) update.name = typeof body.name === "string" ? body.name.trim() || null : null;

  const user = await updateAdminUser(userId, update);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ user });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSuperAdmin();
  if (response) return response;

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const result = await deleteAdminUser(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
