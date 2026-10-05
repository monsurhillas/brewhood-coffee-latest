import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { isValidMonthString } from "@/lib/salaryMonth";
import { normalizeEntry, getSalaryEntry, syncSalaryCosts } from "@/lib/salaryEntries";

export const dynamic = "force-dynamic";

// Creates one staff member's salary entry for a settlement month. Anything
// actually paid (status paid / partial) is posted to Manager Cost under
// "Salary" at the payment date — see lib/salaryEntries.ts.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const staffId = Number(body?.staff_id);
  if (!staffId) return NextResponse.json({ error: "Choose a staff member." }, { status: 400 });
  if (!isValidMonthString(body?.month)) {
    return NextResponse.json({ error: "Choose the settlement month." }, { status: 400 });
  }
  const parsed = normalizeEntry(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  await ensureSalaryTables();
  const db = sql();

  const [member] = await db`SELECT id FROM staff WHERE id = ${staffId}`;
  if (!member) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });

  const rows = await db`
    INSERT INTO salary_entries
      (staff_id, month, salary_amount, advance_amount, amount_paid, status, payment_date, payment_method, note)
    VALUES
      (${staffId}, ${body.month}, ${v.salary_amount}, ${v.advance_amount}, ${v.amount_paid},
       ${v.status}, ${v.payment_date}, ${v.payment_method}, ${v.note})
    ON CONFLICT (staff_id, month) DO NOTHING
    RETURNING id
  `;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "This staff member already has an entry for that month — edit it from Salary History." },
      { status: 409 }
    );
  }

  const entry = await getSalaryEntry(rows[0].id as number);
  if (entry) await syncSalaryCosts(entry);
  return NextResponse.json({ entry }, { status: 201 });
}
