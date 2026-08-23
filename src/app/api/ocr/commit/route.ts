import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type SaleInput = {
  employee_id: number;
  sku_id: number | null;
  sku_name: string;
  quantity: number;
  unit_price: number;
};

type CollectionInput = {
  employee_id: number;
  amount: number;
  method: string;
};

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const date: string | undefined = body?.date;
  const sales: SaleInput[] = Array.isArray(body?.sales) ? body.sales : [];
  const collections: CollectionInput[] = Array.isArray(body?.collections) ? body.collections : [];

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  const baseTime = new Date(`${date}T12:00:00`);
  if (Number.isNaN(baseTime.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (sales.length === 0 && collections.length === 0) {
    return NextResponse.json({ error: "Nothing to upload — every row was removed or left incomplete." }, { status: 400 });
  }

  for (const s of sales) {
    if (
      !s.employee_id ||
      !s.sku_name ||
      !Number.isFinite(s.unit_price) ||
      !Number.isFinite(s.quantity) ||
      s.quantity <= 0
    ) {
      return NextResponse.json(
        { error: "Every sale row needs an employee, an item, a quantity, and a unit price." },
        { status: 400 }
      );
    }
  }
  for (const c of collections) {
    if (!c.employee_id || !Number.isFinite(c.amount) || c.amount <= 0) {
      return NextResponse.json(
        { error: "Every collection row needs an employee and a positive amount." },
        { status: 400 }
      );
    }
  }

  const db = sql();

  // Stagger timestamps a second apart (still all on the chosen day) purely so
  // rows keep their original sheet order in "recent activity" style views —
  // it has no bearing on which day's totals they count toward.
  let offsetSeconds = 0;
  const nextTimestamp = () => {
    const t = new Date(baseTime.getTime() + offsetSeconds * 1000);
    offsetSeconds += 1;
    return t.toISOString();
  };

  const queries = [
    ...sales.map((s) => {
      const total = Math.round(s.unit_price * s.quantity * 100) / 100;
      return db`
        INSERT INTO sales (employee_id, sku_id, sku_name, quantity, unit_price, total, note, created_at)
        VALUES (${s.employee_id}, ${s.sku_id}, ${s.sku_name}, ${s.quantity}, ${s.unit_price}, ${total}, ${"Bulk PDF upload"}, ${nextTimestamp()})
      `;
    }),
    ...collections.map((c) => {
      return db`
        INSERT INTO collections (employee_id, amount, method, is_contra, note, created_at)
        VALUES (${c.employee_id}, ${c.amount}, ${c.method}, false, ${"Bulk PDF upload"}, ${nextTimestamp()})
      `;
    }),
  ];

  try {
    await db.transaction(queries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save entries.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ inserted: { sales: sales.length, collections: collections.length } }, { status: 201 });
}
