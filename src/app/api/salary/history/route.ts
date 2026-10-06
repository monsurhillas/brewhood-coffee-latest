import { NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { monthLabel } from "@/lib/salaryMonth";
import { listSalaryEntries, type SalaryEntryRow } from "@/lib/salaryEntries";

export const dynamic = "force-dynamic";

type Payment = {
  id: number;
  amount: number;
  note: string | null;
  payment_method: string | null;
  date: string; // YYYY-MM-DD, Dhaka
  month: string;
  entry_id: number | null;
  advance_id: number | null; // set when counted as a staff advance
  staff_name: string | null;
};

// Month-by-month salary history, read straight from Manager Cost: every cost
// row in the "Salary" category — the ones posted from salary entries AND
// everything logged by hand in the Manager Cost tab before this existed.
// A hand-logged row has no entry, so it's filed under the month of its own
// date — unless it was assigned to a staff member as an advance, in which case
// it follows the settlement month chosen then; an entry's rows are filed under
// the entry's settlement month (paying September's salary on 5 October is
// still September's).
export async function GET() {
  const { response } = await requireTab("salary");
  if (response) return response;

  await ensureSalaryTables();
  const db = sql();

  const payments = (await db`
    SELECT mc.id, mc.amount::float8 AS amount, mc.note, mc.payment_method,
           to_char(mc.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS date,
           COALESCE(se.month, adv.month, to_char(mc.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM')) AS month,
           se.id AS entry_id, adv.id AS advance_id, COALESCE(s.name, sa.name) AS staff_name
    FROM manager_costs mc
    LEFT JOIN salary_entries se ON se.id = mc.salary_entry_id
    LEFT JOIN staff s ON s.id = se.staff_id
    LEFT JOIN salary_advances adv ON adv.cost_id = mc.id
    LEFT JOIN staff sa ON sa.id = adv.staff_id
    WHERE lower(mc.category) = 'salary'
    ORDER BY mc.created_at DESC, mc.id DESC
    LIMIT 2000
  `) as Payment[];

  const entries = await listSalaryEntries();

  type MonthBlock = {
    month: string;
    label: string;
    paid_total: number;
    due_total: number; // net salary still unpaid across this month's entries
    payments: Payment[];
    entries: SalaryEntryRow[];
  };
  const byMonth = new Map<string, MonthBlock>();
  const block = (month: string): MonthBlock => {
    let b = byMonth.get(month);
    if (!b) {
      b = { month, label: monthLabel(month), paid_total: 0, due_total: 0, payments: [], entries: [] };
      byMonth.set(month, b);
    }
    return b;
  };

  for (const p of payments) {
    const b = block(p.month);
    b.payments.push(p);
    b.paid_total += p.amount;
  }
  for (const e of entries) {
    const b = block(e.month);
    b.entries.push(e);
    b.due_total += Math.max(0, e.salary_amount - e.advance_amount - e.amount_paid);
  }

  const months = [...byMonth.values()]
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((b) => ({
      ...b,
      paid_total: Math.round(b.paid_total * 100) / 100,
      due_total: Math.round(b.due_total * 100) / 100,
    }));

  return NextResponse.json({ months });
}
