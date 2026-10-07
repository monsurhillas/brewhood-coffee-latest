export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS manager_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  // Google-account allowlist for the manager dashboard. is_super_admin
  // bypasses allowed_tabs entirely (full access to every tab, including
  // Admin); everyone else only sees/uses the tabs listed in allowed_tabs.
  // The legacy manager_users credentials login (above) is a temporary
  // fallback and is NOT allowlist-checked — see lib/auth.ts.
  `CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    allowed_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    last_login_at TIMESTAMPTZ
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
    created_at TIMESTAMPTZ DEFAULT now(),
    uploaded_at TIMESTAMPTZ DEFAULT now()
  )`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()`,
  `CREATE TABLE IF NOT EXISTS collections (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    is_contra BOOLEAN NOT NULL DEFAULT false,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    uploaded_at TIMESTAMPTZ DEFAULT now()
  )`,
  `ALTER TABLE collections ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()`,
  `ALTER TABLE collections ADD COLUMN IF NOT EXISTS trx_id TEXT`,
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
  // Invoice numbers continue the shop's existing manually-issued sequence —
  // #1 through #79 were made by hand, so system-generated invoices start at 80.
  `CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 80 MINVALUE 80`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number INTEGER NOT NULL UNIQUE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    items JSONB NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_employee ON invoices(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at)`,
  // Salary tab — internal staff roster, wholly separate from the
  // `employees` customer table above. See ensureSalaryTables() in db.ts for
  // the full rationale; kept in sync here so a fresh /api/init run creates
  // these too.
  `CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT,
    monthly_salary NUMERIC(10,2),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS salary_advances (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    note TEXT,
    month TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS salary_payments (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    salary_amount NUMERIC(10,2) NOT NULL,
    advances_amount NUMERIC(10,2) NOT NULL,
    amount_paid NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, month)
  )`,
  // Payment medium on manager costs + link back to the salary entry a cost
  // was posted from (see ensureCostColumns() / ensureSalaryTables() in db.ts).
  `ALTER TABLE manager_costs ADD COLUMN IF NOT EXISTS payment_method TEXT`,
  `ALTER TABLE manager_costs ADD COLUMN IF NOT EXISTS salary_entry_id INTEGER`,
  `CREATE TABLE IF NOT EXISTS salary_entries (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_salary_entries_month ON salary_entries(month)`,
  `ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS cost_id INTEGER`,
  `ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS cost_auto BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS idx_salary_advances_staff_month ON salary_advances(staff_id, month)`,
  `CREATE INDEX IF NOT EXISTS idx_salary_payments_staff_month ON salary_payments(staff_id, month)`,
];
