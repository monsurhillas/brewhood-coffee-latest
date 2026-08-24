import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = sql();
  const rows = await db`
    SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.subtotal::float8, i.total::float8,
           i.created_at, e.name AS employee_name, e.employee_id
    FROM invoices i
    JOIN employees e ON e.id = i.employee_id
    ORDER BY i.created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ invoices: rows });
}

type ItemInput = { description: string; quantity: number; total: number };

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const employeeId = Number(body?.employee_id);
  const invoiceDate: string | undefined = body?.invoice_date;
  const items: ItemInput[] = Array.isArray(body?.items) ? body.items : [];

  if (!employeeId) {
    return NextResponse.json({ error: "employee_id is required." }, { status: 400 });
  }
  if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    return NextResponse.json({ error: "A valid invoice_date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Add at least one item to the invoice." }, { status: 400 });
  }
  for (const item of items) {
    if (!item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.total)) {
      return NextResponse.json(
        { error: "Every item needs a description, a positive quantity, and a total." },
        { status: 400 }
      );
    }
  }

  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const total = subtotal;

  // Due date is always "today" — the date the invoice is generated/downloaded.
  const now = new Date();
  const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const db = sql();
  try {
    const [{ nextval }] = await db`SELECT nextval('invoice_number_seq') AS nextval`;
    const invoiceNumber = Number(nextval);

    const rows = await db`
      INSERT INTO invoices (invoice_number, employee_id, invoice_date, due_date, items, subtotal, total)
      VALUES (${invoiceNumber}, ${employeeId}, ${invoiceDate}::date, ${dueDate}::date, ${JSON.stringify(items)}::jsonb, ${subtotal}, ${total})
      RETURNING id, invoice_number, invoice_date, due_date, subtotal::float8, total::float8, created_at
    `;
    return NextResponse.json({ invoice: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create invoice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
