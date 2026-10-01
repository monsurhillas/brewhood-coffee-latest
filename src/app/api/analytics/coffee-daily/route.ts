import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { normalizeDrinkName, isCoffeeDrink } from "@/lib/coffeeStats";
import { currentMonthInDhaka, isValidMonthString, daysInMonth } from "@/lib/salaryMonth";

export const dynamic = "force-dynamic";

// Day-by-day coffee-only sales for one calendar month — "only coffee data"
// per the Analytics tab's "Daily Coffee Sales" view: snacks, bottled water
// or any other non-drink SKU never counts here, even though they share the
// same `sales` table. Uses the exact same coffee-drink list as the
// employee share page's mug/"Favourite Drink" feature (coffeeStats.ts) so
// the two "what counts as coffee" answers never drift apart.
export async function GET(request: NextRequest) {
  const { response } = await requireTab("analytics");
  if (response) return response;

  const monthParam = request.nextUrl.searchParams.get("month");
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthInDhaka();

  const db = sql();
  const rows = await db`
    SELECT created_at::date::text AS day, sku_name, SUM(quantity)::int AS qty, SUM(total)::float8 AS amount
    FROM sales
    WHERE to_char(created_at, 'YYYY-MM') = ${month}
    GROUP BY day, sku_name
    ORDER BY day ASC
  `;

  type Row = { day: string; sku_name: string; qty: number; amount: number };

  // Fold each row into its normalized coffee-drink name (e.g. "Americano
  // 2X" merges into "Americano"), dropping anything that isn't a known
  // coffee drink entirely.
  const perDay = new Map<string, Map<string, { qty: number; amount: number }>>();
  const totalsByDrink = new Map<string, { qty: number; amount: number }>();

  for (const r of rows as Row[]) {
    if (!isCoffeeDrink(r.sku_name)) continue;
    const drink = normalizeDrinkName(r.sku_name);

    const dayMap = perDay.get(r.day) ?? new Map();
    const existing = dayMap.get(drink) ?? { qty: 0, amount: 0 };
    existing.qty += r.qty;
    existing.amount += r.amount;
    dayMap.set(drink, existing);
    perDay.set(r.day, dayMap);

    const drinkTotal = totalsByDrink.get(drink) ?? { qty: 0, amount: 0 };
    drinkTotal.qty += r.qty;
    drinkTotal.amount += r.amount;
    totalsByDrink.set(drink, drinkTotal);
  }

  // Column order: best-selling coffee item first, same convention as the
  // "Top Selling Products" chart above it on the Analytics tab.
  const drinkNames = [...totalsByDrink.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([name]) => name);

  const days = daysInMonth(month).map((day) => {
    const dayMap = perDay.get(day);
    const counts: Record<string, number> = {};
    let totalQty = 0;
    let totalAmount = 0;
    for (const name of drinkNames) {
      const v = dayMap?.get(name);
      counts[name] = v?.qty ?? 0;
      totalQty += v?.qty ?? 0;
      totalAmount += v?.amount ?? 0;
    }
    return { day, counts, totalQty, totalAmount };
  });

  const totals = {
    totalQty: [...totalsByDrink.values()].reduce((a, v) => a + v.qty, 0),
    totalAmount: [...totalsByDrink.values()].reduce((a, v) => a + v.amount, 0),
    byDrink: Object.fromEntries(drinkNames.map((name) => [name, totalsByDrink.get(name)!.qty])),
  };

  return NextResponse.json({ month, drinkNames, days, totals });
}
