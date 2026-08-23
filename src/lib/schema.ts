export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS manager_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    balance_override NUMERIC(12,2)
  )`,
  `ALTER TABLE employees ADD COLUMN IF NOT EXISTS balance_override NUMERIC(12,2)`,
  `CREATE TABLE IF NOT EXISTS skus (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price NUMERIC(10,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    sku_id INTEGER REFERENCES skus(id) ON DELETE SET NULL,
    sku_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS collections (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    is_contra BOOLEAN NOT NULL DEFAULT false,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS manager_costs (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_collections_employee ON collections(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_collections_created ON collections(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_costs_created ON manager_costs(created_at)`,
];
