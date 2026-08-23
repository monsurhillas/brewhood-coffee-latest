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
