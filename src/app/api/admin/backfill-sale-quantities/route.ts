import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// One-time cleanup for sales imported from the legacy system (see
// /api/import): the old system's export only had a per-line total, not a
// quantity, so every historical row was loaded as "1 unit at the full
// amount" (e.g. a ৳450 Cappuccino line shows as "Cappuccino × 1" instead of
// "× 3"). Live sales recorded through this app (Sale Entry, Bulk Upload)
// always carry a note, so this only ever touches note IS NULL rows —
// nothing entered through the app itself is at risk.
//
// For each such row, if its total divides evenly by the item's current
// price, we back it out to the real quantity and per-unit price. Rows that
// don't divide evenly (custom pricing, or the item's price has since
// changed) or whose SKU was never matched are left untouched and reported
// back for manual review.
export async function POST() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = sql();

  const updated = await db`
    WITH candidates AS (
      SELECT sa.id, (sa.total / sk.price)::int AS new_quantity, sk.price AS new_unit_price
      FROM sales sa
      JOIN skus sk ON sk.id = sa.sku_id
      WHERE sa.note IS NULL
        AND sa.quantity = 1
        AND sk.price > 0
        AND sa.total <> sk.price
        AND MOD(sa.total, sk.price) = 0
    )
    UPDATE sales sa
    SET quantity = c.new_quantity, unit_price = c.new_unit_price
    FROM candidates c
    WHERE sa.id = c.id
    RETURNING sa.id
  `;

  const unresolvedPricing = await db`
    SELECT sa.id, sa.sku_name, sa.total::float8 AS total, sk.price::float8 AS price, e.name AS employee_name
    FROM sales sa
    JOIN skus sk ON sk.id = sa.sku_id
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.note IS NULL
      AND sa.quantity = 1
      AND sk.price > 0
      AND sa.total <> sk.price
      AND MOD(sa.total, sk.price) <> 0
    ORDER BY sa.total DESC
    LIMIT 20
  `;

  const unresolvedNoSku = await db`
    SELECT sa.id, sa.sku_name, sa.total::float8 AS total, e.name AS employee_name
    FROM sales sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.note IS NULL AND sa.quantity = 1 AND sa.sku_id IS NULL
    ORDER BY sa.total DESC
    LIMIT 20
  `;

  return NextResponse.json({
    updated: updated.length,
    unresolvedPricing,
    unresolvedNoSku,
  });
}
