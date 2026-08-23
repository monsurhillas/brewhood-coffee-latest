import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lightweight, always-visible dashboard summary: total outstanding (what
// employees owe the shop) and total advance balance (what the shop owes
// employees), override-aware so manual settlements from the legacy system
// are reflected here too. Kept separate from /api/analytics so every tab
// switch doesn't pay for the full analytics payload.
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = sql();

  const [row] = await db`
    SELECT
      COALESCE(SUM(GREATEST(bal, 0)), 0)::float8 AS outstanding,
      COALESCE(SUM(GREATEST(-bal, 0)), 0)::float8 AS advance,
      COUNT(*)::int AS employee_count,
      COUNT(*) FILTER (WHERE active)::int AS active_employee_count
    FROM (
      SELECT
        e.active,
        COALESCE(e.balance_override, COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0)) AS bal
      FROM employees e
      LEFT JOIN (SELECT employee_id, SUM(total) AS total_sales FROM sales GROUP BY employee_id) s
        ON s.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected
        FROM collections GROUP BY employee_id
      ) c ON c.employee_id = e.id
    ) x
  `;

  return NextResponse.json({
    outstanding: row.outstanding,
    advance: row.advance,
    employeeCount: row.employee_count,
    activeEmployeeCount: row.active_employee_count,
  });
}
