import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// One row per internal staff member for the requested month: their
// configured monthly salary, how much they've already taken as advances
// this month, the status of this month's salary entry (paid / partial /
// unpaid, if one exists), and the resulting payable. This is the "Salary Advance" concept — entirely separate from
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
      se.id AS entry_id,
      se.status AS entry_status,
      se.salary_amount::float8 AS entry_salary,
      se.advance_amount::float8 AS entry_advance,
      se.amount_paid::float8 AS paid_amount,
      to_char(se.payment_date, 'YYYY-MM-DD') AS payment_date
    FROM staff s
    LEFT JOIN (
      SELECT staff_id, SUM(amount) AS total
      FROM salary_advances
      WHERE month = ${month}
      GROUP BY staff_id
    ) adv ON adv.staff_id = s.id
    LEFT JOIN salary_entries se ON se.staff_id = s.id AND se.month = ${month}
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
    entry_id: number | null;
    entry_status: "paid" | "partial" | "unpaid" | null;
    entry_salary: number | null;
    entry_advance: number | null;
    paid_amount: number | null;
    payment_date: string | null;
  };

  const staff = (rows as Row[]).map((r) => {
    // With a salary entry for the month, payable is what that entry still
    // owes (its own salary - advance - paid so far); without one it's the
    // configured salary less the advances logged so far.
    const hasEntry = r.entry_id !== null;
    const payable = hasEntry
      ? Math.max(0, (r.entry_salary ?? 0) - (r.entry_advance ?? 0) - (r.paid_amount ?? 0))
      : (r.monthly_salary ?? 0) - r.advances_this_month;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      active: r.active,
      monthly_salary: r.monthly_salary,
      advances_this_month: r.advances_this_month,
      status: r.entry_status,
      entry_id: r.entry_id,
      paid_amount: r.paid_amount,
      payment_date: r.payment_date,
      payable,
    };
  });

  return NextResponse.json({ month, staff });
}
