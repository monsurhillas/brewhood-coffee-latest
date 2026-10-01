import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// Pays out an employee's salary for a month: snapshots monthly_salary and
// that month's advances at this moment, records the net amount actually
// paid, and — by virtue of that row existing — zeroes the month's payable
// (see /api/salary/route.ts). The UNIQUE(employee_id, month) constraint is
// the real guard against double-paying; the ON CONFLICT DO NOTHING below
// just turns a race into a clean "already paid" error instead of a crash.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const employeeId = Number(body?.employee_id);
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id is required." }, { status: 400 });
  }
  const month = isValidMonthString(body?.month) ? body.month : currentMonthInDhaka();

  await ensureSalaryTables();
  const db = sql();

  const [emp] = await db`
    SELECT monthly_salary::float8 AS monthly_salary FROM employees WHERE id = ${employeeId}
  `;
  if (!emp) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (!emp.monthly_salary || emp.monthly_salary <= 0) {
    return NextResponse.json({ error: "Set a monthly salary for this employee first." }, { status: 400 });
  }

  const [adv] = await db`
    SELECT COALESCE(SUM(amount), 0)::float8 AS total
    FROM salary_advances WHERE employee_id = ${employeeId} AND month = ${month}
  `;
  const advancesAmount = adv.total;
  const amountPaid = emp.monthly_salary - advancesAmount;

  const rows = await db`
    INSERT INTO salary_payments (employee_id, month, salary_amount, advances_amount, amount_paid)
    VALUES (${employeeId}, ${month}, ${emp.monthly_salary}, ${advancesAmount}, ${amountPaid})
    ON CONFLICT (employee_id, month) DO NOTHING
    RETURNING id, employee_id, month, salary_amount::float8 AS salary_amount,
      advances_amount::float8 AS advances_amount, amount_paid::float8 AS amount_paid, created_at
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "This month's salary has already been paid out." }, { status: 400 });
  }
  return NextResponse.json({ payment: rows[0] }, { status: 201 });
}

// Undoes a payout (e.g. it was recorded by mistake), restoring the month's
// payable so it can be corrected and paid again.
export async function DELETE(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const employeeId = Number(request.nextUrl.searchParams.get("employee_id"));
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id is required." }, { status: 400 });
  }

  const db = sql();
  await db`DELETE FROM salary_payments WHERE employee_id = ${employeeId} AND month = ${month}`;
  return NextResponse.json({ ok: true });
}
