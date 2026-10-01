import { NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Updates a staff member's profile fields and/or their configured monthly
// salary. Kept as one route (rather than splitting salary out) since both
// are just attributes of the same staff record.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  const staffId = Number(id);
  const body = await request.json().catch(() => ({}));

  if (
    "monthly_salary" in body &&
    body.monthly_salary !== null &&
    !Number.isFinite(Number(body.monthly_salary))
  ) {
    return NextResponse.json({ error: "monthly_salary must be a number or null." }, { status: 400 });
  }
  if (typeof body.monthly_salary === "number" && body.monthly_salary < 0) {
    return NextResponse.json({ error: "monthly_salary can't be negative." }, { status: 400 });
  }
  const monthlySalaryValue =
    "monthly_salary" in body ? (body.monthly_salary === null ? null : Number(body.monthly_salary)) : undefined;

  await ensureSalaryTables();
  const db = sql();
  const rows = await db`
    UPDATE staff
    SET
      name = COALESCE(${body.name ?? null}, name),
      phone = CASE WHEN ${"phone" in body} THEN ${body.phone ?? null} ELSE phone END,
      role = CASE WHEN ${"role" in body} THEN ${body.role ?? null} ELSE role END,
      active = COALESCE(${body.active ?? null}, active),
      monthly_salary = CASE WHEN ${"monthly_salary" in body} THEN ${monthlySalaryValue ?? null} ELSE monthly_salary END
    WHERE id = ${staffId}
    RETURNING id, name, phone, role, monthly_salary::float8 AS monthly_salary, active, created_at
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  return NextResponse.json({ staff: rows[0] });
}
