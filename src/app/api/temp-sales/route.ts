import { NextRequest, NextResponse } from "next/server";
import { sql, isPaymentMethod } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";
import { normalizeTrxId } from "@/lib/collectionTrx";
import {
  ensureTempSalesTable,
  listTempCustomers,
  normalizeCustomerName,
  TEMP_MAX_AMOUNT,
} from "@/lib/tempSales";

export const dynamic = "force-dynamic";

// Customers with their current due (open and settled), plus the headline total.
export async function GET() {
  const { response } = await requireTab("temp_sales");
  if (response) return response;
  const customers = await listTempCustomers();
  const open = customers.filter((c) => c.due > 0);
  return NextResponse.json({
    customers,
    totalDue: Math.round(open.reduce((s, c) => s + c.due, 0) * 100) / 100,
    openCount: open.length,
  });
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const round2 = (n: number) => Math.round(n * 100) / 100;

// One endpoint for the three things the tab can record — { type: "sale" |
// "payment" | "adjustment" }. Entries are permanent (no edit / delete); a
// mistake is corrected with an adjustment, same philosophy as contra entries.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("temp_sales");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const type = body?.type;
  if (type !== "sale" && type !== "payment" && type !== "adjustment") {
    return fail("type must be sale, payment or adjustment.");
  }
  const who = normalizeCustomerName(body?.customer_name);
  if (!who) return fail("Enter the customer's name (up to 80 characters).");

  const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  // Entry Date (backdating) — same rules as Sale / Collection Entry.
  const entryDate = body?.entry_date;
  let createdAt: string | null = null;
  if (entryDate !== undefined && entryDate !== null && entryDate !== "") {
    if (!isValidDateString(entryDate) || isFutureDateString(entryDate)) {
      return fail("Entry date can't be in the future.");
    }
    createdAt = dateStringToTimestamp(entryDate);
  }

  await ensureTempSalesTable();
  const db = sql();

  if (type === "sale") {
    const skuName = typeof body?.sku_name === "string" ? body.sku_name.trim() : "";
    const quantity = Number(body?.quantity ?? 1);
    const unitPrice = Number(body?.unit_price);
    const skuId = body?.sku_id ? Number(body.sku_id) : null;
    if (!skuName) return fail("Pick an item or enter a custom item name.");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10000) return fail("Quantity must be a whole number of at least 1.");
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return fail("Enter a unit price greater than zero.");
    const total = round2(unitPrice * quantity);
    if (total > TEMP_MAX_AMOUNT) return fail("That total looks too large — check the quantity and price.");

    // An existing person keeps the name (and casing) they were first entered with.
    const rows = await db`
      INSERT INTO temp_entries (customer_key, customer_name, kind, sku_id, sku_name, quantity, unit_price, amount, note, created_at)
      VALUES (
        ${who.key},
        COALESCE((SELECT customer_name FROM temp_entries WHERE customer_key = ${who.key} ORDER BY id LIMIT 1), ${who.name}),
        'sale', ${skuId}, ${skuName}, ${quantity}, ${unitPrice}, ${total}, ${note},
        COALESCE(${createdAt}::timestamptz, now())
      )
      RETURNING id, customer_key, customer_name, kind, sku_name, quantity, unit_price::float8, amount::float8, note, created_at
    `;
    return NextResponse.json({ entry: rows[0] }, { status: 201 });
  }

  // payment / adjustment — both reduce an existing due, never below zero.
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount greater than zero.");
  const amt = round2(amount);
  if (amt > TEMP_MAX_AMOUNT) return fail("That amount looks too large.");

  let method: string | null = null;
  let trxId: string | null = null;
  if (type === "payment") {
    method = typeof body?.method === "string" && body.method ? body.method : "cash";
    if (!isPaymentMethod(method)) return fail("Method must be cash, bkash or bank.");
    const t = normalizeTrxId(body?.trx_id);
    if (t === undefined) return fail("Trx ID is too long (max 64 characters).");
    if (t && method === "cash") return fail("Trx ID can only be added for bKash or bank payments.");
    trxId = t;
  } else if (!note) {
    return fail("Add a reason for the adjustment (e.g. \"sold wrong item\", \"waived\").");
  }

  // Check-and-insert in one statement so two quick submissions can't
  // overcollect the same due.
  const rows = await db`
    WITH cur AS (
      SELECT COALESCE(SUM(CASE WHEN kind = 'sale' THEN amount ELSE -amount END), 0) AS due,
             (array_agg(customer_name ORDER BY id))[1] AS name
      FROM temp_entries WHERE customer_key = ${who.key}
    )
    INSERT INTO temp_entries (customer_key, customer_name, kind, amount, method, trx_id, note, created_at)
    SELECT ${who.key}::text, cur.name, ${type}::text, ${amt}::numeric, ${method}::text, ${trxId}::text, ${note}::text,
           COALESCE(${createdAt}::timestamptz, now())
    FROM cur WHERE cur.name IS NOT NULL AND cur.due >= ${amt}::numeric
    RETURNING id, customer_key, customer_name, kind, amount::float8, method, trx_id, note, created_at
  `;
  // Two near-simultaneous submissions (a double tap) can both pass the check
  // above. Re-verify now that this row is visible: if the due went negative,
  // back this row out. Every interleaving ends with at most one of them kept.
  if (rows.length > 0) {
    const [after] = await db`
      SELECT COALESCE(SUM(CASE WHEN kind = 'sale' THEN amount ELSE -amount END), 0)::float8 AS due
      FROM temp_entries WHERE customer_key = ${who.key}
    `;
    if (Number(after.due) < 0) {
      await db`DELETE FROM temp_entries WHERE id = ${rows[0].id}`;
      return fail("Someone else just recorded a payment for this customer — refresh and check the current due.", 409);
    }
  }
  if (rows.length === 0) {
    const [c] = await db`
      SELECT COALESCE(SUM(CASE WHEN kind = 'sale' THEN amount ELSE -amount END), 0)::float8 AS due, COUNT(*)::int AS n
      FROM temp_entries WHERE customer_key = ${who.key}
    `;
    if (!c || c.n === 0) return fail(`No temporary sales found for "${who.name}".`, 404);
    return fail(`That's more than the ৳${Number(c.due).toLocaleString("en-BD", { minimumFractionDigits: 2 })} currently due.`, 409);
  }
  return NextResponse.json({ entry: rows[0] }, { status: 201 });
}
