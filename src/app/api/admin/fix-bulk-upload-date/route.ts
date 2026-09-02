import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// One-off fix for a Bulk Upload batch that landed on the wrong calendar day
// (e.g. the OCR misread the sheet's handwritten date). Scoped tightly:
// only rows with note = 'Bulk PDF upload' AND whose current date matches
// `from` are touched, and only their date is shifted to `to` — the
// time-of-day (and therefore relative insert order) is preserved. Nothing
// entered through Sale Entry or Bulk Upload on any other day is affected.
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const from: string | undefined = body?.from;
  const to: string | undefined = body?.to;

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Both 'from' and 'to' are required as YYYY-MM-DD." }, { status: 400 });
  }

  const db = sql();

  const updatedSales = await db`
    UPDATE sales
    SET created_at = (${to}::date + created_at::time)
    WHERE note = 'Bulk PDF upload'
      AND created_at::date = ${from}::date
    RETURNING id, sku_name, quantity, total::float8, created_at
  `;

  const updatedCollections = await db`
    UPDATE collections
    SET created_at = (${to}::date + created_at::time)
    WHERE note = 'Bulk PDF upload'
      AND created_at::date = ${from}::date
    RETURNING id, amount::float8, method, created_at
  `;

  return NextResponse.json({
    updated: updatedSales.length + updatedCollections.length,
    sales: updatedSales,
    collections: updatedCollections,
  });
}
