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
  const rows = await db`
    SELECT id, category, amount::float8, note, created_at
    FROM manager_costs
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ costs: rows });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!body?.category || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "category and a positive amount are required." },
      { status: 400 }
    );
  }

  const db = sql();
  const rows = await db`
    INSERT INTO manager_costs (category, amount, note)
    VALUES (${body.category}, ${amount}, ${body?.note ?? null})
    RETURNING id, category, amount::float8, note, created_at
  `;
  return NextResponse.json({ cost: rows[0] }, { status: 201 });
}
