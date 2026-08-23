import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = sql();
  const rows = await db`SELECT * FROM skus ORDER BY active DESC, name ASC`;
  return NextResponse.json({ skus: rows });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.name || body?.price === undefined) {
    return NextResponse.json({ error: "name and price are required." }, { status: 400 });
  }

  const db = sql();
  const rows = await db`
    INSERT INTO skus (name, category, price)
    VALUES (${body.name}, ${body.category ?? null}, ${body.price})
    RETURNING *
  `;
  return NextResponse.json({ sku: rows[0] }, { status: 201 });
}
