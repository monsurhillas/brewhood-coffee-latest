import { sql } from "@/lib/db";

// Shared by the manager-facing Employee Ledger tab
// (/api/employees/[id]/ledger, session-protected) and each employee's own
// public share link (/api/public/employees/[id], no auth, powers /e/[id]).
// One place computes the running balance so the two can never drift apart
// or reintroduce the "pre-import transactions double-counted" bug that hit
// the manager tab once already.
//
// Sign convention matches /api/employees (EmployeePicker, the public
// directory): balance > 0 means the shop owes the employee (advance
// credit), balance < 0 means the employee owes the shop (outstanding). A
// sale moves the balance down by its total; a regular collection moves it
// up by its amount; a contra entry (a correction/reversal) moves it back
// down by its amount, since it cancels out a prior collection.
//
// balance_override (when set) is a one-time reconciled snapshot from a
// legacy-system import, struck at the moment the employee's row was
// created. Anything dated before that moment is already baked into the
// snapshot, so only sales/collections with created_at AFTER the
// employee's created_at are allowed to move the running balance. Every
// transaction still appears in the list (nothing is hidden), but a
// pre-import one is marked counted: false and leaves the balance
// untouched.

export type LedgerEmployee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  has_override: boolean;
};

export type LedgerTransaction = {
  type: "sale" | "collection" | "contra";
  id: number;
  date: string;
  uploaded_at: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  method: string | null;
  note: string | null;
  counted: boolean;
  balance_after: number | null;
};

export type EmployeeLedger = {
  employee: LedgerEmployee;
  openingBalance: number;
  currentBalance: number;
  totals: {
    sales: number;
    collected: number;
    contra: number;
    transactionCount: number;
    preImportCount: number;
  };
  // Newest first, to match the rest of the dashboard's "recent activity"
  // convention — each row already carries the balance immediately after it
  // happened (or null if it predates the opening balance and so was never
  // applied), so reversing the order doesn't lose that context.
  transactions: LedgerTransaction[];
};

export async function getEmployeeLedger(employeeId: number): Promise<EmployeeLedger | null> {
  const db = sql();

  const employeeRows = await db`
    SELECT id, employee_id, name, phone, role, active, created_at, balance_override
    FROM employees WHERE id = ${employeeId} LIMIT 1
  `;
  const employee = employeeRows[0] as
    | {
        id: number;
        employee_id: string;
        name: string;
        phone: string | null;
        role: string | null;
        active: boolean;
        created_at: string;
        balance_override: number | null;
      }
    | undefined;
  if (!employee) {
    return null;
  }

  const rows = await db`
    SELECT * FROM (
      SELECT
        'sale' AS type,
        sa.id,
        sa.created_at,
        sa.uploaded_at,
        sa.sku_name AS description,
        sa.quantity,
        sa.unit_price::float8 AS unit_price,
        sa.total::float8 AS amount,
        NULL::text AS method,
        false AS is_contra,
        sa.note
      FROM sales sa WHERE sa.employee_id = ${employeeId}
      UNION ALL
      SELECT
        CASE WHEN c.is_contra THEN 'contra' ELSE 'collection' END AS type,
        c.id,
        c.created_at,
        c.uploaded_at,
        NULL::text AS description,
        NULL::int AS quantity,
        NULL::float8 AS unit_price,
        c.amount::float8 AS amount,
        c.method,
        c.is_contra,
        c.note
      FROM collections c WHERE c.employee_id = ${employeeId}
    ) t
    ORDER BY t.created_at ASC, t.type ASC, t.id ASC
  `;

  type Row = {
    type: "sale" | "collection" | "contra";
    id: number;
    created_at: string;
    uploaded_at: string | null;
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
    method: string | null;
    is_contra: boolean;
    note: string | null;
  };

  const openingBalance = -(employee.balance_override ?? 0);
  const employeeCreatedAtMs = new Date(employee.created_at).getTime();
  let running = openingBalance;

  const transactions: LedgerTransaction[] = (rows as Row[]).map((r) => {
    const counted = new Date(r.created_at).getTime() > employeeCreatedAtMs;
    const signedEffect = r.type === "sale" ? -r.amount : r.is_contra ? -r.amount : r.amount;
    if (counted) running += signedEffect;
    return {
      type: r.type,
      id: r.id,
      date: r.created_at,
      uploaded_at: r.uploaded_at,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      amount: r.amount,
      method: r.method,
      note: r.note,
      counted,
      balance_after: counted ? Math.round(running * 100) / 100 : null,
    };
  });

  const totalSales = transactions
    .filter((t) => t.type === "sale" && t.counted)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCollected = transactions
    .filter((t) => t.type === "collection" && t.counted)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalContra = transactions
    .filter((t) => t.type === "contra" && t.counted)
    .reduce((sum, t) => sum + t.amount, 0);
  const preImportCount = transactions.filter((t) => !t.counted).length;

  return {
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      phone: employee.phone,
      role: employee.role,
      active: employee.active,
      created_at: employee.created_at,
      has_override: employee.balance_override !== null && Number(employee.balance_override) !== 0,
    },
    openingBalance: Math.round(openingBalance * 100) / 100,
    currentBalance: Math.round(running * 100) / 100,
    totals: {
      sales: Math.round(totalSales * 100) / 100,
      collected: Math.round(totalCollected * 100) / 100,
      contra: Math.round(totalContra * 100) / 100,
      transactionCount: transactions.length,
      preImportCount,
    },
    transactions: transactions.slice().reverse(),
  };
}
