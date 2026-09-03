import { NextResponse } from "next/server";
import { getEmployeeLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

// Public, no auth — powers each employee's own dedicated share link
// (/e/[id]). This doesn't introduce a new exposure level: /api/employees
// already lists every employee's name and balance with no auth, and
// /api/employees/[id]/transactions already exposes a given employee's
// transaction history to anyone who knows their id. This just makes that
// same data reachable via one employee's own direct link — with their full
// history, not just the last 20 — instead of only through the full
// directory.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "This link doesn't look right." }, { status: 400 });
  }

  const ledger = await getEmployeeLedger(employeeId);
  if (!ledger) {
    return NextResponse.json({ error: "We couldn't find that employee." }, { status: 404 });
  }

  return NextResponse.json(ledger);
}
