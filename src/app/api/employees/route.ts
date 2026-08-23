import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Public: powers the homepage ledger. No auth required, matches the
// original BrewHood Ledger public directory.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "all";

  const db = sql();

  const rows = await db`
    SELECT
      e.id, e.employee_id, e.name, e.phone, e.role, e.active, e.created_at,
      COALESCE(s.total_sales, 0)::float8 AS total_sales,
      COALESCE(c.total_collected, 0)::float8 AS total_collected,
      (COALESCE(s.total_sales, 0) - COALESCE(c.total_collected, 0))::float8 AS balance,
      GREATEST(s.last_sale_at, c.last_activity_at) AS last_activity_at
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, SUM(total) AS total_sales, MAX(created_at) AS last_sale_at
      FROM sales GROUP BY employee_id
    ) s ON s.employee_id = e.id
    LEFT JOIN (
      SELECT employee_id,
        SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected,
        MAX(created_at) AS last_activity_at
      FROM collections GROUP BY employee_id
    ) c ON c.employee_id = e.id
    ORDER BY e.name ASC
  `;

  type Row = {
    id: number;
    employee_id: string;
    name: string;
    phone: string | null;
    role: string | null;
    active: boolean;
    created_at: string;
    total_sales: number;
    total_collected: number;
    balance: number;
    last_activity_at: string | null;
  };

  let filtered = (rows as Row[]).filter((r) => {
    if (!q) return true;
    const hay = `${r.name} ${r.employee_id} ${r.phone ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (status === "active") {
    filtered = filtered.filter((r) => r.active);
  } else if (status === "active_today") {
    filtered = filtered.filter(
      (r) => r.last_activity_at && new Date(r.last_activity_at).getTime() >= startOfToday.getTime()
    );
  } else if (status === "negative_balance") {
    filtered = filtered.filter((r) => r.balance < 0);
  } else if (status === "recent_activity") {
    filtered = filtered.filter(
      (r) => r.last_activity_at && now - new Date(r.last_activity_at).getTime() <= 7 * 24 * 60 * 60 * 1000
    );
  }

  return NextResponse.json({ employees: filtered });
}

// Protected: manual single-employee add (bulk add happens via CSV import).
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.employee_id || !body?.name) {
    return NextResponse.json({ error: "employee_id and name are required." }, { status: 400 });
  }

  const db = sql();
  try {
    const rows = await db`
      INSERT INTO employees (employee_id, name, phone, role)
      VALUES (${body.employee_id}, ${body.name}, ${body.phone ?? null}, ${body.role ?? null})
      RETURNING id, employee_id, name, phone, role, active, created_at
    `;
    return NextResponse.json({ employee: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add employee.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
