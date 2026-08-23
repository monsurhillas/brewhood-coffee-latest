import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const employeeId = Number(id);
  const body = await request.json().catch(() => ({}));

  const db = sql();
  const rows = await db`
    UPDATE employees
    SET
      name = COALESCE(${body.name ?? null}, name),
      phone = CASE WHEN ${"phone" in body} THEN ${body.phone ?? null} ELSE phone END,
      role = CASE WHEN ${"role" in body} THEN ${body.role ?? null} ELSE role END,
      active = COALESCE(${body.active ?? null}, active)
    WHERE id = ${employeeId}
    RETURNING id, employee_id, name, phone, role, active, created_at
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  return NextResponse.json({ employee: rows[0] });
}
