import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// Pays out a staff member's salary for a month: snapshots monthly_salary and
// that month's advances at this moment, records the net amount actually
// paid, and — by virtue of that row existing — zeroes the month's payable
// (see /api/salary/route.ts). The UNIQUE(staff_id, month) constraint is the
// real guard against double-paying; the ON CONFLICT DO NOTHING below just
// turns a race into a clean "already paid" error instead of a crash.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const staffId = Number(body?.staff_id);
  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required." }, { status: 400 });
  }
  const month = isValidMonthString(body?.month) ? body.month : currentMonthInDhaka();

  await ensureSalaryTables();
  const db = sql();

  const [member] = await db`
    SELECT monthly_salary::float8 AS monthly_salary FROM staff WHERE id = ${staffId}
  `;
  if (!member) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  if (!member.monthly_salary || member.monthly_salary <= 0) {
    return NextResponse.json({ error: "Set a monthly salary for this staff member first." }, { status: 400 });
  }

  const [adv] = await db`
    SELECT COALESCE(SUM(amount), 0)::float8 AS total
    FROM salary_advances WHERE staff_id = ${staffId} AND month = ${month}
  `;
  const advancesAmount = adv.total;
  const amountPaid = member.monthly_salary - advancesAmount;

  const rows = await db`
    INSERT INTO salary_payments (staff_id, month, salary_amount, advances_amount, amount_paid)
    VALUES (${staffId}, ${month}, ${member.monthly_salary}, ${advancesAmount}, ${amountPaid})
    ON CONFLICT (staff_id, month) DO NOTHING
    RETURNING id, staff_id, month, salary_amount::float8 AS salary_amount,
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

  const staffId = Number(request.nextUrl.searchParams.get("staff_id"));
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();
  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required." }, { status: 400 });
  }

  const db = sql();
  await db`DELETE FROM salary_payments WHERE staff_id = ${staffId} AND month = ${month}`;
  return NextResponse.json({ ok: true });
}
