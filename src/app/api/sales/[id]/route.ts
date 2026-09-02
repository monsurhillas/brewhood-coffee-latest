import { NextRequest, NextResponse } from "next/server";
import { sql, ensureUploadedAtColumn, BULK_EDIT_WINDOW_DAYS, BULK_UPLOAD_NOTE } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Ledger entries are permanent by design (see collections/[id] for the full
// rationale) — except a Bulk PDF upload row, which came from an OCR read of
// a handwritten sheet and can therefore be wrong (a misread quantity, item,
// or date). Those rows stay editable for BULK_EDIT_WINDOW_DAYS days after
// the upload actually happened (uploaded_at, not the sheet's own date field),
// then lock permanently just like every other entry.
function locked(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await ensureUploadedAtColumn();
  const db = sql();

  const existingRows = await db`
    SELECT id, note, uploaded_at, created_at FROM sales WHERE id = ${id} LIMIT 1
  `;
  const existing = existingRows[0] as { note: string | null; uploaded_at: string | null; created_at: string } | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  }
  if (existing.note !== BULK_UPLOAD_NOTE) {
    return locked("Only Bulk Upload entries can be edited here. Manually-entered sales are permanent — record a correction instead.");
  }
  const uploadedAt = existing.uploaded_at ? new Date(existing.uploaded_at) : null;
  const cutoff = Date.now() - BULK_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (!uploadedAt || uploadedAt.getTime() < cutoff) {
    return locked(`This entry is locked — Bulk Upload rows can only be edited within ${BULK_EDIT_WINDOW_DAYS} days of upload.`);
  }

  const body = await request.json().catch(() => null);
  const employeeId = body?.employee_id !== undefined ? Number(body.employee_id) : undefined;
  const skuId = body?.sku_id !== undefined ? (body.sku_id === null ? null : Number(body.sku_id)) : undefined;
  const skuName: string | undefined = body?.sku_name;
  const quantity = body?.quantity !== undefined ? Number(body.quantity) : undefined;
  const unitPrice = body?.unit_price !== undefined ? Number(body.unit_price) : undefined;
  const date: string | undefined = body?.date;

  if (employeeId !== undefined && (!Number.isFinite(employeeId) || employeeId <= 0)) {
    return NextResponse.json({ error: "Invalid employee." }, { status: 400 });
  }
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
    return NextResponse.json({ error: "Quantity must be a positive number." }, { status: 400 });
  }
  if (unitPrice !== undefined && !Number.isFinite(unitPrice)) {
    return NextResponse.json({ error: "Invalid unit price." }, { status: 400 });
  }
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }

  const nextEmployeeId = employeeId ?? null;
  const nextSkuId = skuId === undefined ? null : skuId;
  const nextSkuName = skuName ?? null;
  const nextQuantity = quantity ?? null;
  const nextUnitPrice = unitPrice ?? null;
  const nextDate = date ?? null;

  const rows = await db`
    UPDATE sales SET
      employee_id = COALESCE(${nextEmployeeId}, employee_id),
      sku_id = CASE WHEN ${skuId !== undefined} THEN ${nextSkuId} ELSE sku_id END,
      sku_name = COALESCE(${nextSkuName}, sku_name),
      quantity = COALESCE(${nextQuantity}, quantity),
      unit_price = COALESCE(${nextUnitPrice}, unit_price),
      total = ROUND(COALESCE(${nextUnitPrice}, unit_price) * COALESCE(${nextQuantity}, quantity), 2),
      created_at = CASE WHEN ${nextDate}::date IS NOT NULL THEN (${nextDate}::date + created_at::time) ELSE created_at END
    WHERE id = ${id}
    RETURNING id, employee_id, sku_id, sku_name, quantity, unit_price::float8, total::float8, note, created_at, uploaded_at
  `;

  return NextResponse.json({ sale: rows[0] });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "Deleting sales is disabled to keep the financial history intact." },
    { status: 405 }
  );
}
