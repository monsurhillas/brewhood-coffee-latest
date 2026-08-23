import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date");
  const db = sql();

  if (date) {
    // Detailed transactions for one day, for the day-report modal.
    const transactions = await db`
      SELECT * FROM (
        SELECT 'sale' AS type, sa.id, sa.created_at, sa.total::float8 AS amount,
               sa.sku_name || ' × ' || sa.quantity AS description, sa.note,
               e.name AS employee_name
        FROM sales sa JOIN employees e ON e.id = sa.employee_id
        WHERE sa.created_at::date = ${date}::date
        UNION ALL
        SELECT CASE WHEN c.is_contra THEN 'contra' ELSE 'collection' END AS type,
               c.id, c.created_at, c.amount::float8 AS amount, UPPER(c.method) AS description, c.note,
               e.name AS employee_name
        FROM collections c JOIN employees e ON e.id = c.employee_id
        WHERE c.created_at::date = ${date}::date
        UNION ALL
        SELECT 'cost' AS type, id, created_at, amount::float8 AS amount, category AS description, note,
               NULL AS employee_name
        FROM manager_costs
        WHERE created_at::date = ${date}::date
      ) t
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ date, transactions });
  }

  const days = await db`
    SELECT
      day,
      COALESCE(SUM(sales_total), 0)::float8 AS sales_total,
      COALESCE(SUM(collections_total), 0)::float8 AS collections_total,
      COALESCE(SUM(costs_total), 0)::float8 AS costs_total,
      COALESCE(SUM(tx_count), 0)::int AS tx_count
    FROM (
      SELECT created_at::date AS day, total AS sales_total, 0 AS collections_total, 0 AS costs_total, 1 AS tx_count
      FROM sales
      UNION ALL
      SELECT created_at::date AS day, 0, CASE WHEN is_contra THEN -amount ELSE amount END, 0, 1
      FROM collections
      UNION ALL
      SELECT created_at::date AS day, 0, 0, amount, 1
      FROM manager_costs
    ) x
    GROUP BY day
    ORDER BY day DESC
    LIMIT 60
  `;

  return NextResponse.json({ days });
}
