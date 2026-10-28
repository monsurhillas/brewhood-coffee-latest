import { NextRequest, NextResponse } from "next/server";
import { isPaymentMethod } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { isValidMonthString } from "@/lib/salaryMonth";
import { ensureSalaryReady, paySalary } from "@/lib/salaryEntries";

export const dynamic = "force-dynamic";

// Pays (part of) a staff member's salary: { staff_id, month (settlement),
// salary_month?, amount, date, payment_method, note?, salary_amount? }.
// What can be paid is what is left after the advances already given for that
// settlement month and anything paid before — see paySalary().
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const staffId = Number(body?.staff_id);
  if (!staffId) return NextResponse.json({ error: "Choose a staff member." }, { status: 400 });
  if (!isValidMonthString(body?.month)) {
    return NextResponse.json({ error: "Choose the settlement month." }, { status: 400 });
  }
  if (body?.salary_month !== undefined && body?.salary_month !== null && !isValidMonthString(body.salary_month)) {
    return NextResponse.json({ error: "Choose a valid salary month." }, { status: 400 });
  }
  const method = body?.payment_method ?? "cash";
  if (!isPaymentMethod(method)) {
    return NextResponse.json({ error: "Payment medium must be cash, bkash or bank." }, { status: 400 });
  }
  const salaryAmount =
    body?.salary_amount === undefined || body?.salary_amount === null || body?.salary_amount === ""
      ? null
      : Number(body.salary_amount);
  if (salaryAmount !== null && (!Number.isFinite(salaryAmount) || salaryAmount <= 0)) {
    return NextResponse.json({ error: "Enter a valid salary amount for the month." }, { status: 400 });
  }

  await ensureSalaryReady();
  const result = await paySalary({
    staffId,
    month: body.month,
    salaryMonth: body.salary_month ?? null,
    amount: Number(body?.amount),
    date: String(body?.date ?? ""),
    method,
    note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
    salaryAmount,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ entry: result.entry, remaining: result.remaining }, { status: 201 });
}
