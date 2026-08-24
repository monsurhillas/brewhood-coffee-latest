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
      (SELECT COUNT(*) FROM sales)::int AS sale_count,
      (
        SELECT COALESCE(SUM(GREATEST(bal, 0)), 0)
        FROM (
          SELECT
            COALESCE(e.balance_override, COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0)) AS bal
          FROM employees e
          LEFT JOIN (SELECT employee_id, SUM(total) AS total_sales FROM sales GROUP BY employee_id) s
            ON s.employee_id = e.id
          LEFT JOIN (
            SELECT employee_id, SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected
            FROM collections GROUP BY employee_id
          ) c ON c.employee_id = e.id
        ) x
      )::float8 AS outstanding_net,
      (
        SELECT COALESCE(SUM(GREATEST(-bal, 0)), 0)
        FROM (
          SELECT
            COALESCE(e.balance_override, COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0)) AS bal
          FROM employees e
          LEFT JOIN (SELECT employee_id, SUM(total) AS total_sales FROM sales GROUP BY employee_id) s
            ON s.employee_id = e.id
          LEFT JOIN (
            SELECT employee_id, SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected
            FROM collections GROUP BY employee_id
          ) c ON c.employee_id = e.id
        ) x
      )::float8 AS advance_net
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

  // Daily trend: sales vs collections vs costs over time, last 120 days.
  const dailyTrend = await db`
    WITH days AS (
      SELECT date_trunc('day', created_at) AS day, total AS amt, 'sales' AS kind FROM sales
      UNION ALL
      SELECT date_trunc('day', created_at) AS day,
             CASE WHEN is_contra THEN -amount ELSE amount END AS amt, 'collections' AS kind
      FROM collections
      UNION ALL
      SELECT date_trunc('day', created_at) AS day, amount AS amt, 'costs' AS kind FROM manager_costs
    )
    SELECT
      day,
      COALESCE(SUM(amt) FILTER (WHERE kind = 'sales'), 0)::float8 AS sales,
      COALESCE(SUM(amt) FILTER (WHERE kind = 'collections'), 0)::float8 AS collections,
      COALESCE(SUM(amt) FILTER (WHERE kind = 'costs'), 0)::float8 AS costs
    FROM days
    WHERE day >= (CURRENT_DATE - INTERVAL '120 days')
    GROUP BY day
    ORDER BY day ASC
  `;

  // Weekday seasonality: which day of the week sells the most (0 = Sunday).
  const weekdaySeasonality = await db`
    SELECT
      EXTRACT(DOW FROM created_at)::int AS weekday,
      SUM(total)::float8 AS sales,
      COUNT(*)::int AS tx_count
    FROM sales
    GROUP BY weekday
    ORDER BY weekday
  `;

  // Hour-of-day pattern: when during the day sales happen most.
  const hourlyPattern = await db`
    SELECT
      EXTRACT(HOUR FROM created_at)::int AS hour,
      SUM(total)::float8 AS sales,
      COUNT(*)::int AS tx_count
    FROM sales
    GROUP BY hour
    ORDER BY hour
  `;

  const employeeActivity = await db`
    SELECT
      e.id, e.employee_id, e.name,
      COALESCE(s.total_sales, 0)::float8 AS total_sales,
      COALESCE(c.total_collected, 0)::float8 AS total_collected,
      -COALESCE(e.balance_override, COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0))::float8 AS balance
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
      net: totals.total_sales - totals.total_costs,
      outstanding: totals.outstanding_net,
      advance: totals.advance_net,
    },
    costBreakdown,
    topProducts,
    employeeActivity,
    dailyTrend,
    weekdaySeasonality,
    hourlyPattern,
  });
}
