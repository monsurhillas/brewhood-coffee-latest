import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { generateInvoicePdf, InvoiceItem } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

function formatLongDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoiceId = Number(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id." }, { status: 400 });
  }

  const db = sql();
  const rows = await db`
    SELECT i.invoice_number, i.invoice_date, i.due_date, i.items, i.subtotal::float8, i.total::float8,
           e.name AS employee_name
    FROM invoices i
    JOIN employees e ON e.id = i.employee_id
    WHERE i.id = ${invoiceId}
  `;
  const invoice = rows[0];
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const items = invoice.items as InvoiceItem[];

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: String(invoice.invoice_number).padStart(4, "0"),
    invoiceDate: formatLongDate(invoice.invoice_date as string),
    dueDate: formatLongDate(invoice.due_date as string),
    customerName: invoice.employee_name as string,
    items,
    subtotal: invoice.subtotal as number,
    total: invoice.total as number,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="brewhood-invoice-${String(invoice.invoice_number).padStart(4, "0")}.pdf"`,
    },
  });
}
