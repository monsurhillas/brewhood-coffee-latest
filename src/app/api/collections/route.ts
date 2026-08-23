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
    SELECT c.id, c.amount::float8, c.method, c.is_contra, c.note, c.created_at,
           e.name AS employee_name, e.employee_id
    FROM collections c
    JOIN employees e ON e.id = c.employee_id
    ORDER BY c.created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ collections: rows });
}

// Handles both regular Collection Entry and Contra Entry (correction) —
// pass is_contra: true for a contra entry. Contra entries reverse a prior
// collection, so they add back to the employee's outstanding balance
// instead of reducing it.
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const employeeId = Number(body?.employee_id);
  const amount = Number(body?.amount);
  const method: string = body?.method || "cash";
  const isContra = Boolean(body?.is_contra);

  if (!employeeId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "employee_id and a positive amount are required." },
      { status: 400 }
    );
  }

  const db = sql();
  const rows = await db`
    INSERT INTO collections (employee_id, amount, method, is_contra, note)
    VALUES (${employeeId}, ${amount}, ${method}, ${isContra}, ${body?.note ?? null})
    RETURNING id, employee_id, amount::float8, method, is_contra, note, created_at
  `;

  return NextResponse.json({ collection: rows[0] }, { status: 201 });
}
