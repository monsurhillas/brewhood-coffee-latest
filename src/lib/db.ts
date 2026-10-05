import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED;

  if (!url) {
    throw new Error(
      "No database connection string found. Connect a Postgres/Neon database to this project on Vercel (Storage tab), which sets DATABASE_URL automatically."
    );
  }
  return url;
}

// Lazily create the client so builds without a DB attached don't crash at import time.
let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon<false, false>(connectionString());
  }
  return _sql;
}

// A customer the coffee shop sells to on credit — tracked via sales,
// collections, and the Employee Ledger / public share-page feature.
// Despite the name (kept for backwards compatibility with the existing
// `employees` table and routes), this is NOT the shop's own internal staff —
// see the separate `Staff` type below for that.
export type Employee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
};

// An internal coffee-shop staff member (barista, manager, etc), wholly
// separate from the `employees` (customer) table above. This is what the
// Salary tab's configuration/advances/payouts are keyed against.
export type Staff = {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  monthly_salary: string | null;
};

export type Sku = {
  id: number;
  name: string;
  category: string | null;
  price: string;
  active: boolean;
  created_at: string;
};

export type ManagerUser = {
  id: number;
  username: string;
  password_hash: string;
  name: string;
};

// Self-healing lazy migration: makes sure `uploaded_at` (the true "when was
// this row inserted" timestamp, independent of the possibly-hand-entered
// `created_at` date) exists on sales/collections. Idempotent and cheap
// (a no-op once the column is there), so routes that need it can just call
// this instead of depending on the guarded /api/init endpoint being re-run.
let _uploadedAtEnsured = false;
export async function ensureUploadedAtColumn(): Promise<void> {
  if (_uploadedAtEnsured) return;
  const db = sql();
  await db.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()`);
  await db.query(`ALTER TABLE collections ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()`);
  _uploadedAtEnsured = true;
}

// Bulk-upload entries can be edited for this long after they were actually
// inserted (not the sale date the sheet says — the real upload time), then
// they lock. Keeps a single source of truth for the window used by the
// bulk-uploads list and the sales/collections edit endpoints.
export const BULK_EDIT_WINDOW_DAYS = 7;
export const BULK_UPLOAD_NOTE = "Bulk PDF upload";

// Self-healing lazy migration (same pattern as ensureUploadedAtColumn) for
// the Salary tab: an internal `staff` roster (wholly separate from the
// `employees` customer table), each staff member's configured monthly
// salary, a log of mid-month advances (kept entirely separate from the
// pre-existing sales/collections "advance balance" concept — see
// salary_payments' comment below for why), and a record of each month's
// salary payout.
let _salaryTablesEnsured = false;
export async function ensureSalaryTables(): Promise<void> {
  if (_salaryTablesEnsured) return;
  const db = sql();

  // One-time corrective migration: salary_advances/salary_payments were
  // briefly shipped keyed on employees(id) — treating the shop's customers
  // as its own staff, which was wrong (see the Staff type above). That
  // version of the feature was never functionally reachable from a correct
  // "create staff, then pay them" flow, so no real salary data can exist
  // under the old schema. `staff` not existing yet is exactly "first run
  // after the fix" — drop the old employee-keyed tables/column so they can
  // be recreated staff-keyed below. Once `staff` exists this check is a
  // single cheap SELECT and the drop never runs again, so it can never
  // touch real future salary data.
  const staffCheck = (await db.query(`SELECT to_regclass('public.staff') AS reg`)) as {
    reg: string | null;
  }[];
  if (!staffCheck[0]?.reg) {
    await db.query(`DROP TABLE IF EXISTS salary_payments`);
    await db.query(`DROP TABLE IF EXISTS salary_advances`);
    await db.query(`ALTER TABLE employees DROP COLUMN IF EXISTS monthly_salary`);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT,
      monthly_salary NUMERIC(10,2),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS salary_advances (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      note TEXT,
      month TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  // One row per staff member per month they were actually paid. Its
  // presence (not a flag) is what zeroes that month's payable — see
  // /api/salary/route.ts. salary_amount/advances_amount are a snapshot at
  // payout time so a later change to monthly_salary never rewrites a
  // month that's already been paid out.
  await db.query(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      salary_amount NUMERIC(10,2) NOT NULL,
      advances_amount NUMERIC(10,2) NOT NULL,
      amount_paid NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(staff_id, month)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_salary_advances_staff_month ON salary_advances(staff_id, month)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_salary_payments_staff_month ON salary_payments(staff_id, month)`);

  // Salary entries supersede salary_payments: one row per staff member per
  // settlement month with the salary/advance figures, a paid/partial/unpaid
  // status, and the payment date + medium. Every taka actually paid out is
  // mirrored into manager_costs (category "Salary") at its payment date —
  // see lib/salaryEntries.ts — so the cost reports stay the single source of
  // truth. salary_payments is left in place, untouched and no longer read.
  const entriesCheck = (await db.query(`SELECT to_regclass('public.salary_entries') AS reg`)) as {
    reg: string | null;
  }[];
  const firstRunOfEntries = !entriesCheck[0]?.reg;
  await ensureCostColumns();
  await db.query(`
    CREATE TABLE IF NOT EXISTS salary_entries (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      salary_amount NUMERIC(10,2) NOT NULL,
      advance_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      payment_date DATE,
      payment_method TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(staff_id, month)
    )
  `);
  if (firstRunOfEntries) {
    // One-time carry-over of anything already marked "paid" with the old
    // Pay Salary button, so it shows up in history and in manager costs.
    // Only runs on the very run that creates salary_entries, so it can never
    // duplicate rows later.
    await db.query(`
      INSERT INTO salary_entries
        (staff_id, month, salary_amount, advance_amount, amount_paid, status, payment_date, payment_method, created_at)
      SELECT staff_id, month, salary_amount, advances_amount, amount_paid, 'paid',
             (created_at AT TIME ZONE 'Asia/Dhaka')::date, 'cash', created_at
      FROM salary_payments
      ON CONFLICT (staff_id, month) DO NOTHING
    `);
    await db.query(`
      INSERT INTO manager_costs (category, amount, note, created_at, payment_method, salary_entry_id)
      SELECT 'Salary', se.amount_paid, 'Salary - ' || s.name || ' (' || se.month || ')',
             se.created_at, 'cash', se.id
      FROM salary_entries se JOIN staff s ON s.id = se.staff_id
      WHERE se.amount_paid > 0
    `);
  }
  await db.query(`CREATE INDEX IF NOT EXISTS idx_salary_entries_month ON salary_entries(month)`);
  _salaryTablesEnsured = true;
}

// Self-healing lazy migration (same pattern as ensureUploadedAtColumn):
// how a manager cost was paid (cash / bkash / bank — null on older rows,
// shown as "—"), and which salary entry (if any) a cost row was posted from.
let _costColumnsEnsured = false;
export async function ensureCostColumns(): Promise<void> {
  if (_costColumnsEnsured) return;
  const db = sql();
  await db.query(`ALTER TABLE manager_costs ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await db.query(`ALTER TABLE manager_costs ADD COLUMN IF NOT EXISTS salary_entry_id INTEGER`);
  _costColumnsEnsured = true;
}

export const PAYMENT_METHODS = ["cash", "bkash", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}
