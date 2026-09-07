import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Powers the Invoices tab's preview: given a customer (employee) and a day,
// return every sale so the manager can pick which ones go on the invoice.
export async function GET(request: NextRequest) {
  const { response } = await requireTab("invoices");
  if (response) return response;

  const employeeId = Number(request.nextUrl.searchParams.get("employee_id"));
  const date = request.nextUrl.searchParams.get("date");

  if (!employeeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "employee_id and a valid date (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const db = sql();
  const rows = await db`
    SELECT id, sku_name, quantity, unit_price::float8, total::float8, created_at
    FROM sales
    WHERE employee_id = ${employeeId} AND created_at::date = ${date}::date
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ sales: rows });
}
