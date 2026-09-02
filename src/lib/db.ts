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

export type Employee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
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
