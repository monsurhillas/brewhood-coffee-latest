import { NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Sets (or clears) an employee's configured monthly salary. Separate from
// the general /api/employees/[id] PATCH so this can stay gated behind the
// "salary" tab specifically rather than whichever tab touches employee
// records generally.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  const employeeId = Number(id);
  const body = await request.json().catch(() => ({}));

  if (body.monthly_salary !== null && !Number.isFinite(Number(body.monthly_salary))) {
    return NextResponse.json({ error: "monthly_salary must be a number or null." }, { status: 400 });
  }
  const value = body.monthly_salary === null ? null : Number(body.monthly_salary);
  if (value !== null && value < 0) {
    return NextResponse.json({ error: "monthly_salary can't be negative." }, { status: 400 });
  }

  await ensureSalaryTables();
  const db = sql();
  const rows = await db`
    UPDATE employees SET monthly_salary = ${value}
    WHERE id = ${employeeId}
    RETURNING id, employee_id, name, monthly_salary::float8 AS monthly_salary
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  return NextResponse.json({ employee: rows[0] });
}
