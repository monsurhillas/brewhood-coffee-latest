import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// One row per internal staff member for the requested month: their
// configured monthly salary, how much they've already taken as advances
// this month, whether this month has been paid out, and the resulting
// payable. This is the "Salary Advance" concept — entirely separate from
// the sales/collections ledger's own "Advance Balance" stat shown elsewhere
// in the dashboard, and entirely separate from the `employees` table (which
// represents the shop's customers, not its staff).
export async function GET(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();

  await ensureSalaryTables();
  const db = sql();

  const rows = await db`
    SELECT
      s.id, s.name, s.phone, s.role, s.active,
      s.monthly_salary::float8 AS monthly_salary,
      COALESCE(adv.total, 0)::float8 AS advances_this_month,
      pay.amount_paid::float8 AS paid_amount,
      pay.created_at AS paid_at
    FROM staff s
    LEFT JOIN (
      SELECT staff_id, SUM(amount) AS total
      FROM salary_advances
      WHERE month = ${month}
      GROUP BY staff_id
    ) adv ON adv.staff_id = s.id
    LEFT JOIN salary_payments pay ON pay.staff_id = s.id AND pay.month = ${month}
    ORDER BY s.active DESC, s.name ASC
  `;

  type Row = {
    id: number;
    name: string;
    phone: string | null;
    role: string | null;
    active: boolean;
    monthly_salary: number | null;
    advances_this_month: number;
    paid_amount: number | null;
    paid_at: string | null;
  };

  const staff = (rows as Row[]).map((r) => {
    const paid = r.paid_amount !== null;
    const payable = paid ? 0 : (r.monthly_salary ?? 0) - r.advances_this_month;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      active: r.active,
      monthly_salary: r.monthly_salary,
      advances_this_month: r.advances_this_month,
      paid,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
      payable,
    };
  });

  return NextResponse.json({ month, staff });
}
