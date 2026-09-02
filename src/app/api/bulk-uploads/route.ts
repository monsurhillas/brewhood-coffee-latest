import { NextResponse } from "next/server";
import { sql, ensureUploadedAtColumn, BULK_EDIT_WINDOW_DAYS, BULK_UPLOAD_NOTE } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Bulk-upload entries (sales and collections) that are still inside their
// edit window — i.e. uploaded_at is within the last BULK_EDIT_WINDOW_DAYS
// days. Once that window passes, a row simply stops appearing here (it's
// still in the normal ledger/reports, just no longer editable). Ordered by
// uploaded_at ascending, so the entries closest to locking show first.
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUploadedAtColumn();
  const db = sql();

  const sales = await db`
    SELECT sa.id, 'sale' AS type, sa.employee_id, e.name AS employee_name, e.employee_id AS employee_code,
           sa.sku_id, sa.sku_name, sa.quantity, sa.unit_price::float8, sa.total::float8,
           sa.created_at, sa.uploaded_at
    FROM sales sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.note = ${BULK_UPLOAD_NOTE}
      AND sa.uploaded_at >= now() - (${BULK_EDIT_WINDOW_DAYS} || ' days')::interval
    ORDER BY sa.uploaded_at ASC
  `;

  const collections = await db`
    SELECT c.id, 'collection' AS type, c.employee_id, e.name AS employee_name, e.employee_id AS employee_code,
           c.amount::float8, c.method,
           c.created_at, c.uploaded_at
    FROM collections c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.note = ${BULK_UPLOAD_NOTE}
      AND c.uploaded_at >= now() - (${BULK_EDIT_WINDOW_DAYS} || ' days')::interval
    ORDER BY c.uploaded_at ASC
  `;

  const entries = [...sales, ...collections].sort(
    (a, b) => new Date(a.uploaded_at as string).getTime() - new Date(b.uploaded_at as string).getTime()
  );

  return NextResponse.json({ entries, editWindowDays: BULK_EDIT_WINDOW_DAYS });
}
