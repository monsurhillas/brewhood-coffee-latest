import { NextRequest, NextResponse } from "next/server";
import { sql, ensureUploadedAtColumn, BULK_EDIT_WINDOW_DAYS, BULK_UPLOAD_NOTE } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Financial ledger entries are permanent. This app intentionally does not
// allow editing or deleting a recorded sale/collection/contra entry, so the
// history a manager sees always matches what actually happened. To correct
// a mistake, record a new Contra Entry from the Collection Entry tab — that
// keeps a full, honest audit trail instead of silently rewriting the past.
//
// The one exception: a row inserted by Bulk PDF upload came from an OCR read
// of a handwritten sheet, so it can be plainly wrong (wrong amount, wrong
// date). Those rows stay editable for BULK_EDIT_WINDOW_DAYS days after the
// upload actually happened (uploaded_at — not the sheet's own date field,
// which is exactly the value that can be misread), then lock permanently
// like everything else.
function disabled() {
  return NextResponse.json(
    {
      error:
        "Editing or deleting ledger entries is disabled to keep the financial history intact. Record a contra entry to correct a mistake instead.",
    },
    { status: 405 }
  );
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
    SELECT id, note, uploaded_at FROM collections WHERE id = ${id} LIMIT 1
  `;
  const existing = existingRows[0] as { note: string | null; uploaded_at: string | null } | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Collection not found." }, { status: 404 });
  }
  if (existing.note !== BULK_UPLOAD_NOTE) {
    return disabled();
  }
  const uploadedAt = existing.uploaded_at ? new Date(existing.uploaded_at) : null;
  const cutoff = Date.now() - BULK_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (!uploadedAt || uploadedAt.getTime() < cutoff) {
    return NextResponse.json(
      { error: `This entry is locked — Bulk Upload rows can only be edited within ${BULK_EDIT_WINDOW_DAYS} days of upload.` },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const employeeId = body?.employee_id !== undefined ? Number(body.employee_id) : undefined;
  const amount = body?.amount !== undefined ? Number(body.amount) : undefined;
  const method: string | undefined = body?.method;
  const date: string | undefined = body?.date;

  if (employeeId !== undefined && (!Number.isFinite(employeeId) || employeeId <= 0)) {
    return NextResponse.json({ error: "Invalid employee." }, { status: 400 });
  }
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }

  const nextEmployeeId = employeeId ?? null;
  const nextAmount = amount ?? null;
  const nextMethod = method ?? null;
  const nextDate = date ?? null;

  const rows = await db`
    UPDATE collections SET
      employee_id = COALESCE(${nextEmployeeId}, employee_id),
      amount = COALESCE(${nextAmount}, amount),
      method = COALESCE(${nextMethod}, method),
      created_at = CASE WHEN ${nextDate}::date IS NOT NULL THEN (${nextDate}::date + created_at::time) ELSE created_at END
    WHERE id = ${id}
    RETURNING id, employee_id, amount::float8, method, is_contra, note, created_at, uploaded_at
  `;

  return NextResponse.json({ collection: rows[0] });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return disabled();
}
