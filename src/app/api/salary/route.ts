import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// One row per employee for the requested month: their configured monthly
// salary, how much they've already taken as advances this month, whether
// this month has been paid out, and the resulting payable. This is the
// "Salary Advance" concept — entirely separate from the sales/collections
// ledger's own "Advance Balance" stat shown elsewhere in the dashboard.
export async function GET(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();

  await ensureSalaryTables();
  const db = sql();

  const rows = await db`
    SELECT
      e.id, e.employee_id, e.name, e.active,
      e.monthly_salary::float8 AS monthly_salary,
      COALESCE(adv.total, 0)::float8 AS advances_this_month,
      pay.amount_paid::float8 AS paid_amount,
      pay.created_at AS paid_at
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, SUM(amount) AS total
      FROM salary_advances
      WHERE month = ${month}
      GROUP BY employee_id
    ) adv ON adv.employee_id = e.id
    LEFT JOIN salary_payments pay ON pay.employee_id = e.id AND pay.month = ${month}
    ORDER BY e.active DESC, e.name ASC
  `;

  type Row = {
    id: number;
    employee_id: string;
    name: string;
    active: boolean;
    monthly_salary: number | null;
    advances_this_month: number;
    paid_amount: number | null;
    paid_at: string | null;
  };

  const employees = (rows as Row[]).map((r) => {
    const paid = r.paid_amount !== null;
    const payable = paid ? 0 : (r.monthly_salary ?? 0) - r.advances_this_month;
    return {
      id: r.id,
      employee_id: r.employee_id,
      name: r.name,
      active: r.active,
      monthly_salary: r.monthly_salary,
      advances_this_month: r.advances_this_month,
      paid,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
      payable,
    };
  });

  return NextResponse.json({ month, employees });
}
