import { NextRequest, NextResponse } from "next/server";
import { sql, ensureCostColumns, isPaymentMethod } from "@/lib/db";
import { requireTab } from "@/lib/session";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireTab("cost");
  if (response) return response;
  await ensureCostColumns();
  const db = sql();
  const rows = await db`
    SELECT id, category, amount::float8, note, payment_method, salary_entry_id, created_at
    FROM manager_costs
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `;
  return NextResponse.json({ costs: rows });
}

export async function POST(request: NextRequest) {
  const { response } = await requireTab("cost");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!body?.category || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "category and a positive amount are required." },
      { status: 400 }
    );
  }

  // How it was paid — cash / bkash / bank. Defaults to cash so older
  // clients that don't send it keep working.
  const paymentMethod = body?.payment_method ?? "cash";
  if (!isPaymentMethod(paymentMethod)) {
    return NextResponse.json({ error: "payment_method must be cash, bkash or bank." }, { status: 400 });
  }

  // Entry Date control (same backdating as /api/sales and /api/collections):
  // created_at becomes noon on the chosen date; future dates are rejected.
  const entryDate = body?.entry_date;
  let createdAt: string | undefined;
  if (entryDate !== undefined && entryDate !== null && entryDate !== "") {
    if (!isValidDateString(entryDate) || isFutureDateString(entryDate)) {
      return NextResponse.json({ error: "Entry date can't be in the future." }, { status: 400 });
    }
    createdAt = dateStringToTimestamp(entryDate);
  }

  await ensureCostColumns();
  const db = sql();
  const rows = createdAt
    ? await db`
        INSERT INTO manager_costs (category, amount, note, payment_method, created_at)
        VALUES (${body.category}, ${amount}, ${body?.note ?? null}, ${paymentMethod}, ${createdAt})
        RETURNING id, category, amount::float8, note, payment_method, salary_entry_id, created_at
      `
    : await db`
        INSERT INTO manager_costs (category, amount, note, payment_method)
        VALUES (${body.category}, ${amount}, ${body?.note ?? null}, ${paymentMethod})
        RETURNING id, category, amount::float8, note, payment_method, salary_entry_id, created_at
      `;
  return NextResponse.json({ cost: rows[0] }, { status: 201 });
}
