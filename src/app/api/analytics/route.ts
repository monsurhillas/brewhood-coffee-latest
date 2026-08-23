import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = sql();

  const [totals] = await db`
    SELECT
      (SELECT COALESCE(SUM(total), 0) FROM sales)::float8 AS total_sales,
      (SELECT COALESCE(SUM(CASE WHEN is_contra THEN -amount ELSE amount END), 0) FROM collections)::float8 AS total_collected,
      (SELECT COALESCE(SUM(amount), 0) FROM manager_costs)::float8 AS total_costs,
      (SELECT COUNT(*) FROM employees)::int AS employee_count,
      (SELECT COUNT(*) FROM employees WHERE active)::int AS active_employee_count,
      (SELECT COUNT(*) FROM sales)::int AS sale_count
  `;

  const costBreakdown = await db`
    SELECT category, SUM(amount)::float8 AS total
    FROM manager_costs
    GROUP BY category
    ORDER BY total DESC
  `;

  const topProducts = await db`
    SELECT sku_name, SUM(quantity)::int AS units_sold, SUM(total)::float8 AS revenue
    FROM sales
    GROUP BY sku_name
    ORDER BY revenue DESC
    LIMIT 10
  `;

  const employeeActivity = await db`
    SELECT
      e.id, e.employee_id, e.name,
      COALESCE(s.total_sales, 0)::float8 AS total_sales,
      COALESCE(c.total_collected, 0)::float8 AS total_collected,
      (COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0))::float8 AS balance
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, SUM(total) AS total_sales FROM sales GROUP BY employee_id
    ) s ON s.employee_id = e.id
    LEFT JOIN (
      SELECT employee_id, SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected
      FROM collections GROUP BY employee_id
    ) c ON c.employee_id = e.id
    ORDER BY total_sales DESC NULLS LAST
    LIMIT 25
  `;

  return NextResponse.json({
    totals: {
      ...totals,
      net: totals.total_collected - totals.total_costs,
      outstanding: totals.total_sales - totals.total_collected,
    },
    costBreakdown,
    topProducts,
    employeeActivity,
  });
}
