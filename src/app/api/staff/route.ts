import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// The shop's own internal staff roster (baristas, managers, etc) — wholly
// separate from the `employees` table, which represents customers. Gated
// behind the "salary" tab since staff profiles exist to support the
// salary/advances/payouts workflow.
export async function GET() {
  const { response } = await requireTab("salary");
  if (response) return response;

  await ensureSalaryTables();
  const db = sql();
  const rows = await db`
    SELECT id, name, phone, role, monthly_salary::float8 AS monthly_salary, active, created_at
    FROM staff
    ORDER BY active DESC, name ASC
  `;
  return NextResponse.json({ staff: rows });
}

export async function POST(request: NextRequest) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  await ensureSalaryTables();
  const db = sql();
  const rows = await db`
    INSERT INTO staff (name, phone, role)
    VALUES (${body.name.trim()}, ${body.phone ?? null}, ${body.role ?? null})
    RETURNING id, name, phone, role, monthly_salary::float8 AS monthly_salary, active, created_at
  `;
  return NextResponse.json({ staff: rows[0] }, { status: 201 });
}
