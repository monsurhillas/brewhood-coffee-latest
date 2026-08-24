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

  // balance_override, when set, is a one-time reconciled snapshot from the
  // legacy-system import — not a permanent freeze. Only activity recorded
  // AFTER the employee's row was created (i.e. after import) is added on
  // top of it, so new sales/collections keep moving the totals instead of
  // being silently ignored forever.
  const [row] = await db`
    SELECT
      COALESCE(SUM(GREATEST(bal, 0)), 0)::float8 AS outstanding,
      COALESCE(SUM(GREATEST(-bal, 0)), 0)::float8 AS advance,
      COUNT(*)::int AS employee_count,
      COUNT(*) FILTER (WHERE active)::int AS active_employee_count
    FROM (
      SELECT
        e.active,
        COALESCE(e.balance_override, 0)
          + COALESCE((SELECT SUM(sa.total) FROM sales sa WHERE sa.employee_id = e.id AND sa.created_at > e.created_at), 0)
          - COALESCE((SELECT SUM(CASE WHEN co.is_contra THEN -co.amount ELSE co.amount END) FROM collections co WHERE co.employee_id = e.id AND co.created_at > e.created_at), 0) AS bal
      FROM employees e
    ) x
  `;

  return NextResponse.json({
    outstanding: row.outstanding,
    advance: row.advance,
    employeeCount: row.employee_count,
    activeEmployeeCount: row.active_employee_count,
  });
}
