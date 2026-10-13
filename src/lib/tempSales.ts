import { sql } from "@/lib/db";

// Temporary Sales: dues for people who have no employee/customer profile.
//
// A deliberately separate, lightweight ledger — no profile is ever created.
// Each row is one event for a typed name:
//   sale        raises the person's due
//   payment     collection against the due (cash / bkash / bank, optional Trx ID)
//   adjustment  waive / correct part of the due (reason required) — the only
//               way to fix a mistake, since rows are permanent like the main
//               ledger
// Amounts are always stored positive; `kind` decides the direction.
// A person's due = sales − payments − adjustments, grouped by `customer_key`
// (the typed name lower-cased with spaces collapsed, so "rahim  Uddin" and
// "Rahim Uddin" are the same person). Payments/adjustments can never exceed the
// current due, so a due never goes negative.

export const TEMP_MAX_AMOUNT = 10_000_000;
export const TEMP_NAME_MAX = 80;

export type TempKind = "sale" | "payment" | "adjustment";

export function normalizeCustomerName(raw: unknown): { name: string; key: string } | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > TEMP_NAME_MAX) return null;
  return { name, key: name.toLowerCase() };
}

let _tempEnsured = false;
export async function ensureTempSalesTable(): Promise<void> {
  if (_tempEnsured) return;
  const db = sql();
  await db.query(`CREATE TABLE IF NOT EXISTS temp_entries (
    id SERIAL PRIMARY KEY,
    customer_key TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    sku_id INTEGER,
    sku_name TEXT,
    quantity INTEGER,
    unit_price NUMERIC(10,2),
    amount NUMERIC(12,2) NOT NULL,
    method TEXT,
    trx_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    uploaded_at TIMESTAMPTZ DEFAULT now()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_temp_entries_customer ON temp_entries(customer_key, created_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_temp_entries_created ON temp_entries(created_at)`);
  _tempEnsured = true;
}

export type TempCustomer = {
  key: string;
  name: string;
  due: number;
  sales_total: number;
  paid_total: number;
  adjusted_total: number;
  entry_count: number;
  last_activity: string;
};

export async function listTempCustomers(): Promise<TempCustomer[]> {
  await ensureTempSalesTable();
  const db = sql();
  const rows = await db`
    SELECT
      customer_key AS key,
      (array_agg(customer_name ORDER BY id))[1] AS name,
      (COALESCE(SUM(amount) FILTER (WHERE kind = 'sale'), 0)
        - COALESCE(SUM(amount) FILTER (WHERE kind <> 'sale'), 0))::float8 AS due,
      COALESCE(SUM(amount) FILTER (WHERE kind = 'sale'), 0)::float8 AS sales_total,
      COALESCE(SUM(amount) FILTER (WHERE kind = 'payment'), 0)::float8 AS paid_total,
      COALESCE(SUM(amount) FILTER (WHERE kind = 'adjustment'), 0)::float8 AS adjusted_total,
      COUNT(*)::int AS entry_count,
      MAX(created_at) AS last_activity
    FROM temp_entries
    GROUP BY customer_key
    ORDER BY due DESC, MAX(created_at) DESC
  `;
  return rows as TempCustomer[];
}

// Total of every open temporary due — added to "Total Outstanding".
export async function getTempDueTotal(): Promise<number> {
  await ensureTempSalesTable();
  const db = sql();
  const [row] = await db`
    SELECT COALESCE(SUM(GREATEST(due, 0)), 0)::float8 AS total, COUNT(*) FILTER (WHERE due > 0)::int AS open_count
    FROM (
      SELECT SUM(CASE WHEN kind = 'sale' THEN amount ELSE -amount END) AS due
      FROM temp_entries GROUP BY customer_key
    ) x
  `;
  return Number(row.total) || 0;
}

export type TempLedgerRow = {
  id: number;
  kind: TempKind;
  created_at: string;
  sku_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  method: string | null;
  trx_id: string | null;
  note: string | null;
  balance_after: number;
};

export async function getTempLedger(key: string): Promise<{ name: string; due: number; rows: TempLedgerRow[] } | null> {
  await ensureTempSalesTable();
  const db = sql();
  const rows = (await db`
    SELECT id, kind, created_at, customer_name, sku_name, quantity, unit_price::float8 AS unit_price,
           amount::float8 AS amount, method, trx_id, note
    FROM temp_entries WHERE customer_key = ${key}
    ORDER BY created_at ASC, id ASC
  `) as (Omit<TempLedgerRow, "balance_after"> & { customer_name: string })[];
  if (rows.length === 0) return null;
  let running = 0;
  const out: TempLedgerRow[] = rows.map((r) => {
    running += r.kind === "sale" ? r.amount : -r.amount;
    running = Math.round(running * 100) / 100;
    return {
      id: r.id,
      kind: r.kind,
      created_at: r.created_at,
      sku_name: r.sku_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      amount: r.amount,
      method: r.method,
      trx_id: r.trx_id,
      note: r.note,
      balance_after: running,
    };
  });
  return { name: rows[0].customer_name, due: running, rows: out.reverse() };
}
