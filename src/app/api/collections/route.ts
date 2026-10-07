import { NextRequest, NextResponse } from "next/server";
import { sql, isPaymentMethod } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { ensureCollectionTrxColumn, normalizeTrxId } from "@/lib/collectionTrx";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireTab("collection");
  if (response) return response;
  await ensureCollectionTrxColumn();
  const db = sql();
  const rows = await db`
    SELECT c.id, c.amount::float8, c.method, c.is_contra, c.trx_id, c.note, c.created_at,
           e.name AS employee_name, e.employee_id
    FROM collections c
    JOIN employees e ON e.id = c.employee_id
    ORDER BY c.created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ collections: rows });
}

// Handles both regular Collection Entry and Contra Entry (correction) —
// pass is_contra: true for a contra entry. Contra entries reverse a prior
// collection, so they add back to the employee's outstanding balance
// instead of reducing it.
export async function POST(request: NextRequest) {
  const { response } = await requireTab("collection");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const employeeId = Number(body?.employee_id);
  const amount = Number(body?.amount);
  const method: string = body?.method || "cash";
  const isContra = Boolean(body?.is_contra);
  const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!employeeId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "employee_id and a positive amount are required." },
      { status: 400 }
    );
  }

  if (!isPaymentMethod(method)) {
    return NextResponse.json({ error: "Method must be cash, bkash or bank." }, { status: 400 });
  }

  // Optional transaction ID — only meaningful for bKash / bank payments.
  const trxId = normalizeTrxId(body?.trx_id);
  if (trxId === undefined) {
    return NextResponse.json({ error: "Trx ID is too long (max 64 characters)." }, { status: 400 });
  }
  if (trxId && method === "cash") {
    return NextResponse.json({ error: "Trx ID can only be added for bKash or bank collections." }, { status: 400 });
  }

  // Entry Date control on the Collection Entry tab (see useEntryDate.ts) —
  // same backdating support as /api/sales, see its comment for the details.
  const entryDate = body?.entry_date;
  let createdAt: string | undefined;
  if (entryDate !== undefined && entryDate !== null && entryDate !== "") {
    if (!isValidDateString(entryDate) || isFutureDateString(entryDate)) {
      return NextResponse.json({ error: "Entry date can't be in the future." }, { status: 400 });
    }
    createdAt = dateStringToTimestamp(entryDate);
  }

  await ensureCollectionTrxColumn();
  const db = sql();
  const rows = createdAt
    ? await db`
        INSERT INTO collections (employee_id, amount, method, is_contra, trx_id, note, created_at)
        VALUES (${employeeId}, ${amount}, ${method}, ${isContra}, ${trxId}, ${note}, ${createdAt})
        RETURNING id, employee_id, amount::float8, method, is_contra, trx_id, note, created_at
      `
    : await db`
        INSERT INTO collections (employee_id, amount, method, is_contra, trx_id, note)
        VALUES (${employeeId}, ${amount}, ${method}, ${isContra}, ${trxId}, ${note})
        RETURNING id, employee_id, amount::float8, method, is_contra, trx_id, note, created_at
      `;

  return NextResponse.json({ collection: rows[0] }, { status: 201 });
}
