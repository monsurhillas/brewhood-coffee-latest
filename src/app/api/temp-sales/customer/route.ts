import { NextRequest, NextResponse } from "next/server";
import { requireTab } from "@/lib/session";
import { getTempLedger } from "@/lib/tempSales";

export const dynamic = "force-dynamic";

// Full history for one temporary customer (newest first, each row carrying the
// due immediately after it), for the expandable rows in the Temp Sales tab.
export async function GET(request: NextRequest) {
  const { response } = await requireTab("temp_sales");
  if (response) return response;
  const key = request.nextUrl.searchParams.get("key")?.trim().toLowerCase();
  if (!key) return NextResponse.json({ error: "key is required." }, { status: 400 });
  const ledger = await getTempLedger(key);
  if (!ledger) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  return NextResponse.json(ledger);
}
