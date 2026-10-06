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
    SELECT id, staff_id, amount::float8 AS amount, note, month, created_at, cost_id
    FROM salary_advances
    WHERE staff_id = ${staffId} AND month = ${month}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ month, advances });
}

// Records an advance against a staff member's payable for a month. Two ways:
//   - { staff_id, amount, month }  a new advance, as before;
//   - { staff_id, cost_id, month } count money that was ALREADY paid out and
//     logged as a "Salary" cost in Manager Cost. The amount and date come
//     from that cost row, the month is the settlement month you choose (the
//     dates can differ), and no second cost is posted.
// Kept as its own table (salary_advances) rather than reusing the
// sales/collections "collections" table — this money isn't a customer
// payment coming in, it's wages going out early, and conflating the two
// would corrupt both the sales ledger balance and this payable math.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const staffId = Number(body?.staff_id);
  const costId = body?.cost_id === undefined || body?.cost_id === null ? null : Number(body.cost_id);
  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required." }, { status: 400 });
  }

  await ensureSalaryTables();
  const db = sql();

  let amount = Number(body?.amount);
  let note: string | null = body?.note ?? null;
  let createdAt: string | null = null;
  let month = isValidMonthString(body?.month) ? body.month : currentMonthInDhaka();

  if (costId !== null) {
    const [cost] = (await db`
      SELECT id, category, amount::float8 AS amount, note, salary_entry_id, created_at,
             to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS cost_month
      FROM manager_costs WHERE id = ${costId}
    `) as {
      id: number;
      category: string;
      amount: number;
      note: string | null;
      salary_entry_id: number | null;
      created_at: string;
      cost_month: string;
    }[];
    if (!cost || cost.category.toLowerCase() !== "salary") {
      return NextResponse.json({ error: "That isn't a Salary cost in Manager Cost." }, { status: 400 });
    }
    if (cost.salary_entry_id !== null) {
      return NextResponse.json({ error: "That payment already belongs to a salary entry." }, { status: 400 });
    }
    const [linked] = await db`SELECT id FROM salary_advances WHERE cost_id = ${costId} LIMIT 1`;
    if (linked) {
      return NextResponse.json({ error: "That payment is already counted as an advance." }, { status: 400 });
    }
    amount = cost.amount;
    note = cost.note ?? "From Manager Cost";
    createdAt = cost.created_at;
    if (!isValidMonthString(body?.month)) month = cost.cost_month;
  } else if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "staff_id and a positive amount are required." }, { status: 400 });
  }

  const [entry] = (await db`
    SELECT id, status, salary_amount::float8 AS salary_amount,
           advance_amount::float8 AS advance_amount, amount_paid::float8 AS amount_paid
    FROM salary_entries WHERE staff_id = ${staffId} AND month = ${month} LIMIT 1
  `) as { id: number; status: string; salary_amount: number; advance_amount: number; amount_paid: number }[];

  if (entry?.status === "paid") {
    return NextResponse.json(
      { error: "This month's salary has already been paid out — advances now count toward next month." },
      { status: 400 }
    );
  }
  // An entry that exists but isn't paid yet carries its own advance figure;
  // keep it in step so its payable stays right.
  if (entry) {
    const newAdvance = Math.round((entry.advance_amount + amount) * 100) / 100;
    if (newAdvance > entry.salary_amount || entry.amount_paid > entry.salary_amount - newAdvance + 0.001) {
      return NextResponse.json(
        { error: "That advance doesn't fit this month's salary entry — edit the entry first." },
        { status: 400 }
      );
    }
    await db`UPDATE salary_entries SET advance_amount = ${newAdvance} WHERE id = ${entry.id}`;
  }

  const rows = createdAt
    ? await db`
        INSERT INTO salary_advances (staff_id, amount, note, month, created_at, cost_id)
        VALUES (${staffId}, ${amount}, ${note}, ${month}, ${createdAt}, ${costId})
        RETURNING id, staff_id, amount::float8 AS amount, note, month, created_at, cost_id
      `
    : await db`
        INSERT INTO salary_advances (staff_id, amount, note, month)
        VALUES (${staffId}, ${amount}, ${note}, ${month})
        RETURNING id, staff_id, amount::float8 AS amount, note, month, created_at, cost_id
      `;
  return NextResponse.json({ advance: rows[0] }, { status: 201 });
}
