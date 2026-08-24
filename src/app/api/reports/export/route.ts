import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const TYPES = ["sales", "collections", "costs", "employees"] as const;
type ReportType = (typeof TYPES)[number];

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type") as ReportType | null;
  if (!type || !TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of ${TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = sql();
  let csv: string;

  if (type === "sales") {
    const rows = await db`
      SELECT sa.created_at, e.employee_id, e.name, sa.sku_name, sa.quantity,
             sa.unit_price::float8, sa.total::float8, sa.note
      FROM sales sa JOIN employees e ON e.id = sa.employee_id
      ORDER BY sa.created_at DESC
    `;
    csv = toCsv(
      ["Date", "Employee ID", "Employee", "Item", "Qty", "Unit Price", "Total", "Note"],
      rows.map((r) => [
        new Date(r.created_at as string).toISOString(),
        r.employee_id as string,
        r.name as string,
        r.sku_name as string,
        r.quantity as number,
        r.unit_price as number,
        r.total as number,
        (r.note as string) ?? "",
      ])
    );
  } else if (type === "collections") {
    const rows = await db`
      SELECT c.created_at, e.employee_id, e.name, c.amount::float8, c.method, c.is_contra, c.note
      FROM collections c JOIN employees e ON e.id = c.employee_id
      ORDER BY c.created_at DESC
    `;
    csv = toCsv(
      ["Date", "Employee ID", "Employee", "Amount", "Method", "Contra", "Note"],
      rows.map((r) => [
        new Date(r.created_at as string).toISOString(),
        r.employee_id as string,
        r.name as string,
        r.amount as number,
        r.method as string,
        r.is_contra ? "Yes" : "No",
        (r.note as string) ?? "",
      ])
    );
  } else if (type === "costs") {
    const rows = await db`
      SELECT created_at, category, amount::float8, note FROM manager_costs ORDER BY created_at DESC
    `;
    csv = toCsv(
      ["Date", "Category", "Amount", "Note"],
      rows.map((r) => [
        new Date(r.created_at as string).toISOString(),
        r.category as string,
        r.amount as number,
        (r.note as string) ?? "",
      ])
    );
  } else {
    const rows = await db`
      SELECT
        e.employee_id, e.name, e.phone, e.role, e.active, e.created_at,
        COALESCE(s.total_sales, 0)::float8 AS total_sales,
        COALESCE(c.total_collected, 0)::float8 AS total_collected,
        -(
          COALESCE(e.balance_override, 0)
          + COALESCE((SELECT SUM(sa.total) FROM sales sa WHERE sa.employee_id = e.id AND sa.created_at > e.created_at), 0)
          - COALESCE((SELECT SUM(CASE WHEN co.is_contra THEN -co.amount ELSE co.amount END) FROM collections co WHERE co.employee_id = e.id AND co.created_at > e.created_at), 0)
        )::float8 AS balance
      FROM employees e
      LEFT JOIN (SELECT employee_id, SUM(total) AS total_sales FROM sales GROUP BY employee_id) s
        ON s.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(CASE WHEN is_contra THEN -amount ELSE amount END) AS total_collected
        FROM collections GROUP BY employee_id
      ) c ON c.employee_id = e.id
      ORDER BY e.name ASC
    `;
    csv = toCsv(
      ["Employee ID", "Name", "Phone", "Role", "Active", "Joined", "Total Sales", "Total Collected", "Balance"],
      rows.map((r) => [
        r.employee_id as string,
        r.name as string,
        (r.phone as string) ?? "",
        (r.role as string) ?? "",
        r.active ? "Yes" : "No",
        new Date(r.created_at as string).toISOString(),
        r.total_sales as number,
        r.total_collected as number,
        r.balance as number,
      ])
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="brewhood-${type}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
