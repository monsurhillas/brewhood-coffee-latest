import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const skuId = Number(id);
  const body = await request.json().catch(() => ({}));

  const db = sql();
  const rows = await db`
    UPDATE skus
    SET
      name = COALESCE(${body.name ?? null}, name),
      category = CASE WHEN ${"category" in body} THEN ${body.category ?? null} ELSE category END,
      price = COALESCE(${body.price ?? null}, price),
      active = COALESCE(${body.active ?? null}, active)
    WHERE id = ${skuId}
    RETURNING *
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "SKU not found." }, { status: 404 });
  }
  return NextResponse.json({ sku: rows[0] });
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
  const skuId = Number(id);
  const db = sql();
  await db`UPDATE skus SET active = false WHERE id = ${skuId}`;
  return NextResponse.json({ ok: true });
}
