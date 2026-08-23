import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public: per-employee "Transaction History (Last 20)" modal on the homepage.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const db = sql();

  const rows = await db`
    SELECT * FROM (
      SELECT
        'sale' AS type,
        id,
        created_at,
        total::float8 AS amount,
        sku_name || ' × ' || quantity AS description,
        note
      FROM sales WHERE employee_id = ${employeeId}
      UNION ALL
      SELECT
        CASE WHEN is_contra THEN 'contra' ELSE 'collection' END AS type,
        id,
        created_at,
        amount::float8 AS amount,
        UPPER(method) AS description,
        note
      FROM collections WHERE employee_id = ${employeeId}
    ) t
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({ transactions: rows });
}
