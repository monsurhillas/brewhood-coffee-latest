import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireTab("sale");
  if (response) return response;
  const db = sql();
  const rows = await db`
    SELECT sa.id, sa.quantity, sa.unit_price::float8, sa.total::float8, sa.sku_name,
           sa.note, sa.created_at, e.name AS employee_name, e.employee_id
    FROM sales sa
    JOIN employees e ON e.id = sa.employee_id
    ORDER BY sa.created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ sales: rows });
}

export async function POST(request: NextRequest) {
  const { response } = await requireTab("sale");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const employeeId = Number(body?.employee_id);
  const skuId = body?.sku_id ? Number(body.sku_id) : null;
  const skuName: string | undefined = body?.sku_name;
  const quantity = Number(body?.quantity ?? 1);
  const unitPrice = Number(body?.unit_price);

  if (!employeeId || !skuName || !Number.isFinite(unitPrice) || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json(
      { error: "employee_id, sku_name, quantity and unit_price are required." },
      { status: 400 }
    );
  }

  // Entry Date control on the Sale Entry tab (see useEntryDate.ts) — lets a
  // manager backdate this sale to cover a day they forgot to log. Absent or
  // empty means "today" (the normal case). created_at becomes noon on the
  // chosen date; uploaded_at (the real insert time) is untouched and keeps
  // recording via its own column default — see db.ts's comment on it.
  const entryDate = body?.entry_date;
  let createdAt: string | undefined;
  if (entryDate !== undefined && entryDate !== null && entryDate !== "") {
    if (!isValidDateString(entryDate) || isFutureDateString(entryDate)) {
      return NextResponse.json({ error: "Entry date can't be in the future." }, { status: 400 });
    }
    createdAt = dateStringToTimestamp(entryDate);
  }

  const total = Math.round(unitPrice * quantity * 100) / 100;
  const db = sql();
  const rows = createdAt
    ? await db`
        INSERT INTO sales (employee_id, sku_id, sku_name, quantity, unit_price, total, note, created_at)
        VALUES (${employeeId}, ${skuId}, ${skuName}, ${quantity}, ${unitPrice}, ${total}, ${body?.note ?? null}, ${createdAt})
        RETURNING id, employee_id, sku_id, sku_name, quantity, unit_price::float8, total::float8, note, created_at
      `
    : await db`
        INSERT INTO sales (employee_id, sku_id, sku_name, quantity, unit_price, total, note)
        VALUES (${employeeId}, ${skuId}, ${skuName}, ${quantity}, ${unitPrice}, ${total}, ${body?.note ?? null})
        RETURNING id, employee_id, sku_id, sku_name, quantity, unit_price::float8, total::float8, note, created_at
      `;

  return NextResponse.json({ sale: rows[0] }, { status: 201 });
}
