import { NextRequest, NextResponse } from "next/server";
import { sql, isPaymentMethod, ensureCostColumns } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { ensureCollectionTrxColumn, normalizeTrxId } from "@/lib/collectionTrx";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";
import {
  EDIT_WINDOW_DAYS,
  ensureEntryEditsTable,
  inWindowSql,
  isEntryType,
  cleanRemarks,
  round2,
  sameNum,
  REMARKS_MIN,
  type EditChange,
  type EntryType,
} from "@/lib/entryEdits";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { cash: "Cash", bkash: "bKash", bank: "Bank" };
const mLabel = (m: string | null) => (m ? (METHOD_LABEL[m] ?? m) : "—");

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// Fix a mistake in a recorded Sale, Collection (or contra) or Manager Cost:
//   { type: "sale" | "collection" | "cost", id, remarks, changes: { ... } }
// `remarks` (why it is being changed) is mandatory. Only entries dated within
// the last EDIT_WINDOW_DAYS days can be edited. The entry is updated in place
// and the change is logged to entry_edits in the SAME statement, so an edit
// can never exist without its history. See lib/entryEdits.ts.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const type = body?.type;
  if (!isEntryType(type)) return fail("Unknown entry type.");
  const { session, response } = await requireTab(type === "cost" ? "cost" : type);
  if (response) return response;

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid entry.");
  const remarks = cleanRemarks(body?.remarks);
  if (!remarks) return fail(`Remarks are required — write at least ${REMARKS_MIN} characters on why this is being edited.`);
  const changes: Record<string, unknown> =
    body?.changes && typeof body.changes === "object" && !Array.isArray(body.changes) ? body.changes : {};

  const date = has(changes, "date") ? changes.date : undefined;
  if (date !== undefined && (!isValidDateString(date) || isFutureDateString(date))) {
    return fail("Date can't be in the future.");
  }

  await ensureEntryEditsTable();
  const editor = session?.user?.email ?? session?.user?.name ?? null;
  const dayExpr = "to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')";
  const win = inWindowSql("created_at");
  const db = sql();

  const outOfWindow = () => fail(`Only entries dated in the last ${EDIT_WINDOW_DAYS} days can be edited.`, 403);
  const log: EditChange[] = [];
  let result: { id: number }[];

  if (type === "sale") {
    const [row] = (await db.query(
      `SELECT sku_id, sku_name, quantity, unit_price::float8 AS unit_price, total::float8 AS total, ${dayExpr} AS day, ${win} AS in_window
       FROM sales WHERE id = $1`,
      [id]
    )) as { sku_id: number | null; sku_name: string; quantity: number; unit_price: number; total: number; day: string; in_window: boolean }[];
    if (!row) return fail("Sale not found.", 404);
    if (!row.in_window) return outOfWindow();

    const qty = has(changes, "quantity") ? Number(changes.quantity) : row.quantity;
    if (!Number.isInteger(qty) || qty <= 0) return fail("Quantity must be a whole number above 0.");
    const price = has(changes, "unit_price") ? Number(changes.unit_price) : row.unit_price;
    if (!Number.isFinite(price) || price < 0) return fail("Enter a valid unit price.");
    let skuId = row.sku_id;
    let skuName = row.sku_name;
    if (has(changes, "sku_name")) {
      skuName = typeof changes.sku_name === "string" ? changes.sku_name.trim() : "";
      if (!skuName) return fail("Pick an item.");
      skuId = changes.sku_id === null || changes.sku_id === undefined || changes.sku_id === "" ? null : Number(changes.sku_id);
      if (skuId !== null && !Number.isInteger(skuId)) return fail("Invalid item.");
    }
    const newDay = typeof date === "string" ? date : row.day;
    const total = round2(price * qty);

    if (newDay !== row.day) log.push({ field: "date", label: "Date", kind: "date", from: row.day, to: newDay });
    if (skuName !== row.sku_name) log.push({ field: "item", label: "Item", kind: "text", from: row.sku_name, to: skuName });
    if (qty !== row.quantity) log.push({ field: "quantity", label: "Quantity", kind: "number", from: row.quantity, to: qty });
    if (!sameNum(price, row.unit_price)) log.push({ field: "unit_price", label: "Unit price", kind: "money", from: row.unit_price, to: price });
    if (!sameNum(total, row.total)) log.push({ field: "total", label: "Total", kind: "money", from: row.total, to: total });
    if (log.length === 0) return fail("Nothing was changed.");

    result = (await db.query(
      `WITH upd AS (
         UPDATE sales SET sku_id = $2::int, sku_name = $3, quantity = $4, unit_price = $5, total = $6,
                created_at = CASE WHEN $7::boolean THEN $8::timestamptz ELSE created_at END
         WHERE id = $1 AND ${win} RETURNING id
       )
       INSERT INTO entry_edits (entry_type, entry_id, edited_by, remarks, changes)
       SELECT 'sale', id, $9, $10, $11::jsonb FROM upd RETURNING id`,
      [id, skuId, skuName, qty, price, total, newDay !== row.day, dateStringToTimestamp(newDay), editor, remarks, JSON.stringify(log)]
    )) as { id: number }[];
  } else if (type === "collection") {
    await ensureCollectionTrxColumn();
    const [row] = (await db.query(
      `SELECT amount::float8 AS amount, method, trx_id, ${dayExpr} AS day, ${win} AS in_window FROM collections WHERE id = $1`,
      [id]
    )) as { amount: number; method: string; trx_id: string | null; day: string; in_window: boolean }[];
    if (!row) return fail("Collection not found.", 404);
    if (!row.in_window) return outOfWindow();

    const amount = has(changes, "amount") ? Number(changes.amount) : row.amount;
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be above 0.");
    const method = has(changes, "method") ? changes.method : row.method;
    if (!isPaymentMethod(method)) return fail("Method must be cash, bkash or bank.");
    let trx: string | null = row.trx_id;
    if (has(changes, "trx_id")) {
      const t = normalizeTrxId(changes.trx_id);
      if (t === undefined) return fail("Trx ID is too long (max 64 characters).");
      trx = t;
    }
    if (method === "cash") {
      if (has(changes, "trx_id") && trx) return fail("Trx ID can only be added for bKash or bank collections.");
      trx = null; // switching to cash drops the (now meaningless) Trx ID
    }
    const newDay = typeof date === "string" ? date : row.day;

    if (newDay !== row.day) log.push({ field: "date", label: "Date", kind: "date", from: row.day, to: newDay });
    if (!sameNum(amount, row.amount)) log.push({ field: "amount", label: "Amount", kind: "money", from: row.amount, to: amount });
    if (method !== row.method) log.push({ field: "method", label: "Method", kind: "text", from: mLabel(row.method), to: mLabel(method) });
    if ((trx ?? null) !== (row.trx_id ?? null)) log.push({ field: "trx_id", label: "Trx ID", kind: "text", from: row.trx_id, to: trx });
    if (log.length === 0) return fail("Nothing was changed.");

    result = (await db.query(
      `WITH upd AS (
         UPDATE collections SET amount = $2, method = $3, trx_id = $4,
                created_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE created_at END
         WHERE id = $1 AND ${win} RETURNING id
       )
       INSERT INTO entry_edits (entry_type, entry_id, edited_by, remarks, changes)
       SELECT 'collection', id, $7, $8, $9::jsonb FROM upd RETURNING id`,
      [id, amount, method, trx, newDay !== row.day, dateStringToTimestamp(newDay), editor, remarks, JSON.stringify(log)]
    )) as { id: number }[];
  } else {
    await ensureCostColumns();
    const [row] = (await db.query(
      `SELECT category, amount::float8 AS amount, note, payment_method, ${dayExpr} AS day, ${win} AS in_window,
              (salary_entry_id IS NOT NULL OR EXISTS (SELECT 1 FROM salary_advances a WHERE a.cost_id = manager_costs.id)) AS salary_linked
       FROM manager_costs WHERE id = $1`,
      [id]
    )) as { category: string; amount: number; note: string | null; payment_method: string | null; day: string; in_window: boolean; salary_linked: boolean }[];
    if (!row) return fail("Cost not found.", 404);
    if (!row.in_window) return outOfWindow();
    if (row.salary_linked) return fail("This cost is created from the Salary tab — change it there so salary stays in step.", 403);

    const category = has(changes, "category") ? (typeof changes.category === "string" ? changes.category.trim() : "") : row.category;
    if (!category || category.length > 60) return fail("Pick a category.");
    const amount = has(changes, "amount") ? Number(changes.amount) : row.amount;
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be above 0.");
    const method = has(changes, "payment_method") ? changes.payment_method : row.payment_method ?? "cash";
    if (!isPaymentMethod(method)) return fail("Paid via must be cash, bkash or bank.");
    let note: string | null = row.note;
    if (has(changes, "note")) {
      note = typeof changes.note === "string" && changes.note.trim() ? changes.note.trim().slice(0, 500) : null;
    }
    const newDay = typeof date === "string" ? date : row.day;

    if (newDay !== row.day) log.push({ field: "date", label: "Date", kind: "date", from: row.day, to: newDay });
    if (category !== row.category) log.push({ field: "category", label: "Category", kind: "text", from: row.category, to: category });
    if (!sameNum(amount, row.amount)) log.push({ field: "amount", label: "Amount", kind: "money", from: row.amount, to: amount });
    if (method !== (row.payment_method ?? "cash")) log.push({ field: "payment_method", label: "Paid via", kind: "text", from: mLabel(row.payment_method ?? "cash"), to: mLabel(method) });
    if ((note ?? null) !== (row.note ?? null)) log.push({ field: "note", label: "Note", kind: "text", from: row.note, to: note });
    if (log.length === 0) return fail("Nothing was changed.");

    result = (await db.query(
      `WITH upd AS (
         UPDATE manager_costs SET category = $2, amount = $3, payment_method = $4, note = $5,
                created_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE created_at END
         WHERE id = $1 AND ${win} RETURNING id
       )
       INSERT INTO entry_edits (entry_type, entry_id, edited_by, remarks, changes)
       SELECT 'cost', id, $8, $9, $10::jsonb FROM upd RETURNING id`,
      [id, category, amount, method, note, newDay !== row.day, dateStringToTimestamp(newDay), editor, remarks, JSON.stringify(log)]
    )) as { id: number }[];
  }

  if (result.length === 0) return outOfWindow();
  return NextResponse.json({ ok: true, edit_id: result[0].id, changes: log });
}

export type { EntryType };
