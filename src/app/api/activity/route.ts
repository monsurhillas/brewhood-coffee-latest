import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public: powers the homepage "Recent Activity" feed — a friendly, human
// log of what's been happening ("X ordered a Latte!") rather than a raw
// balance table. No auth required, same as the rest of the public ledger.
export async function GET() {
  const db = sql();

  const rows = await db`
    SELECT * FROM (
      SELECT
        'sale' AS type,
        s.id,
        s.created_at,
        s.sku_name AS label,
        s.quantity::int AS quantity,
        s.total::float8 AS amount,
        e.name AS employee_name,
        e.employee_id AS employee_code,
        false AS is_contra
      FROM sales s
      JOIN employees e ON e.id = s.employee_id
      UNION ALL
      SELECT
        CASE WHEN c.is_contra THEN 'contra' ELSE 'collection' END AS type,
        c.id,
        c.created_at,
        UPPER(c.method) AS label,
        1 AS quantity,
        c.amount::float8 AS amount,
        e.name AS employee_name,
        e.employee_id AS employee_code,
        c.is_contra
      FROM collections c
      JOIN employees e ON e.id = c.employee_id
    ) t
    ORDER BY created_at DESC
    LIMIT 30
  `;

  return NextResponse.json({ activity: rows });
}
