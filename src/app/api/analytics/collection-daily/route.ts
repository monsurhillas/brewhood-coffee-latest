import { NextRequest, NextResponse } from "next/server";
import { sql, PAYMENT_METHODS } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { ensureTempSalesTable } from "@/lib/tempSales";
import { currentMonthInDhaka, isValidMonthString, daysInMonth } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// Day-by-day money collected for one calendar month, split by how it was
// paid (cash / bKash / bank) — the Analytics tab's "Daily Collection" view.
//
// Deliberately NOT split by customer or product: collections are applied
// first-in-first-out against whatever is owed, and customers often pay
// ahead, so a collection can't be tied to a particular coffee or sale.
// Payment method is the one honest breakdown of a collection.
//
// Matches how the rest of the app counts collections:
//  - contra entries (corrections/reversals) subtract from the day they were
//    logged on, exactly as in Analytics totals and Day-wise Reports;
//  - payments received against Temp Sales customers count too, since that
//    is real money collected (their sales are already in the sales figures);
//  - waive/correct adjustments on Temp Sales are NOT money and are ignored;
//  - days are grouped by created_at::date, same as the other daily views, so
//    a day here always agrees with the same day in Day-wise Reports.
export async function GET(request: NextRequest) {
  const { response } = await requireTab("analytics");
  if (response) return response;

  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();

  await ensureTempSalesTable();
  const db = sql();
  const rows = (await db`
    SELECT day, method, SUM(amt)::float8 AS amount, COUNT(*)::int AS entries
    FROM (
      SELECT created_at::date::text AS day, lower(COALESCE(NULLIF(trim(method), ''), 'cash')) AS method,
             CASE WHEN is_contra THEN -amount ELSE amount END AS amt, created_at
      FROM collections
      UNION ALL
      SELECT created_at::date::text AS day, lower(COALESCE(NULLIF(trim(method), ''), 'cash')) AS method,
             amount AS amt, created_at
      FROM temp_entries WHERE kind = 'payment'
    ) c
    WHERE to_char(created_at, 'YYYY-MM') = ${month}
    GROUP BY day, method
    ORDER BY day ASC
  `) as { day: string; method: string; amount: number; entries: number }[];

  // Cash / bKash / bank are the three methods the entry forms allow. Any
  // legacy or imported row with another label is kept (so the Total column
  // never silently drops money) in a fourth "Other" column that only appears
  // when there is something in it.
  const known = new Set<string>(PAYMENT_METHODS);
  const perDay = new Map<string, Record<string, number>>();
  const entriesPerDay = new Map<string, number>();
  let hasOther = false;

  for (const r of rows) {
    const key = known.has(r.method) ? r.method : "other";
    if (key === "other" && r.amount !== 0) hasOther = true;
    const dayMap = perDay.get(r.day) ?? {};
    dayMap[key] = (dayMap[key] ?? 0) + r.amount;
    perDay.set(r.day, dayMap);
    entriesPerDay.set(r.day, (entriesPerDay.get(r.day) ?? 0) + r.entries);
  }

  const methods: string[] = [...PAYMENT_METHODS, ...(hasOther ? ["other"] : [])];

  const byMethod: Record<string, number> = Object.fromEntries(methods.map((m) => [m, 0]));
  let grand = 0;
  let entryCount = 0;

  const days = daysInMonth(month).map((day) => {
    const dayMap = perDay.get(day);
    const amounts: Record<string, number> = {};
    let total = 0;
    for (const m of methods) {
      const v = dayMap?.[m] ?? 0;
      amounts[m] = v;
      total += v;
      byMethod[m] += v;
    }
    const entries = entriesPerDay.get(day) ?? 0;
    grand += total;
    entryCount += entries;
    return { day, amounts, total, entries };
  });

  return NextResponse.json({
    month,
    methods,
    days,
    totals: { byMethod, total: grand, entries: entryCount },
  });
}
