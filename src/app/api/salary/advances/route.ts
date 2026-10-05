import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { currentMonthInDhaka, isValidMonthString } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// List the individual advances behind one staff member's "advances this
// month" total, for the Salary tab's expandable detail (so a mistaken entry
// can be found and removed rather than only ever seeing the lump sum).
export async function GET(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const staffId = Number(request.nextUrl.searchParams.get("staff_id"));
  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();
  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required." }, { status: 400 });
  }

  await ensureSalaryTables();
  const db = sql();
  const advances = await db`
    SELECT id, staff_id, amount::float8 AS amount, note, month, created_at
    FROM salary_advances
    WHERE staff_id = ${staffId} AND month = ${month}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ month, advances });
}

// Records a mid-month advance against a staff member's current-month
// payable. Kept as its own table (salary_advances) rather than reusing the
// sales/collections "collections" table — this money isn't a customer
// payment coming in, it's wages going out early, and conflating the two
// would corrupt both the sales ledger balance and this payable math.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const staffId = Number(body?.staff_id);
  const amount = Number(body?.amount);
  if (!staffId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "staff_id and a positive amount are required." }, { status: 400 });
  }
  const month = isValidMonthString(body?.month) ? body.month : currentMonthInDhaka();

  await ensureSalaryTables();
  const db = sql();

  const [already] = await db`
    SELECT id FROM salary_entries
    WHERE staff_id = ${staffId} AND month = ${month} AND status = 'paid' LIMIT 1
  `;
  if (already) {
    return NextResponse.json(
      { error: "This month's salary has already been paid out — advances now count toward next month." },
      { status: 400 }
    );
  }

  const rows = await db`
    INSERT INTO salary_advances (staff_id, amount, note, month)
    VALUES (${staffId}, ${amount}, ${body?.note ?? null}, ${month})
    RETURNING id, staff_id, amount::float8 AS amount, note, month, created_at
  `;
  return NextResponse.json({ advance: rows[0] }, { status: 201 });
}
