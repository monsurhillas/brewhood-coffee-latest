import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Protected: full transaction history for one employee, for the manager
// dashboard's "Employee Ledger" search. Unlike the public
// /api/employees/[id]/transactions endpoint (capped at 20 rows, for the
// homepage), this returns every sale, collection, and contra entry ever
// recorded for the employee, in chronological order, each annotated with
// the running balance immediately after it — so a manager can see exactly
// how the employee's balance got to where it is today, one entry at a time.
//
// Sign convention matches /api/employees (EmployeePicker, the directory):
// balance > 0 means the shop owes the employee (advance credit), balance
// < 0 means the employee owes the shop (outstanding). A sale moves the
// balance down by its total; a regular collection moves it up by its
// amount; a contra entry (a correction/reversal) moves it back down by its
// amount, since it cancels out a prior collection.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
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
  let running = openingBalance;

  const transactions = (rows as Row[]).map((r) => {
    const signedEffect = r.type === "sale" ? -r.amount : r.is_contra ? -r.amount : r.amount;
    running += signedEffect;
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
      balance_after: Math.round(running * 100) / 100,
    };
  });

  const totalSales = transactions
    .filter((t) => t.type === "sale")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCollected = transactions
    .filter((t) => t.type === "collection")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalContra = transactions
    .filter((t) => t.type === "contra")
    .reduce((sum, t) => sum + t.amount, 0);

  return NextResponse.json({
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
    currentBalance: transactions.length ? transactions[transactions.length - 1].balance_after : Math.round(openingBalance * 100) / 100,
    totals: {
      sales: Math.round(totalSales * 100) / 100,
      collected: Math.round(totalCollected * 100) / 100,
      contra: Math.round(totalContra * 100) / 100,
      transactionCount: transactions.length,
    },
    // Newest first, to match the rest of the dashboard's "recent activity"
    // convention — each row already carries the balance immediately after
    // it happened, so reversing the order here doesn't lose that context.
    transactions: transactions.slice().reverse(),
  });
}
