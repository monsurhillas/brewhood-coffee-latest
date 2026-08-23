import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Only reachable when the dashboard's "Enable Editing" toggle is on —
// lets a manager correct or remove a past collection/contra entry.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const collectionId = Number(id);
  const body = await request.json().catch(() => ({}));

  const db = sql();
  const rows = await db`
    UPDATE collections
    SET
      amount = COALESCE(${body.amount ?? null}, amount),
      method = COALESCE(${body.method ?? null}, method),
      note = CASE WHEN ${"note" in body} THEN ${body.note ?? null} ELSE note END
    WHERE id = ${collectionId}
    RETURNING id, employee_id, amount::float8, method, is_contra, note, created_at
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }
  return NextResponse.json({ collection: rows[0] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const collectionId = Number(id);
  const db = sql();
  await db`DELETE FROM collections WHERE id = ${collectionId}`;
  return NextResponse.json({ ok: true });
}
