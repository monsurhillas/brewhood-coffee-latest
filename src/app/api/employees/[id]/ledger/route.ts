import { NextResponse } from "next/server";
import { getEmployeeLedger } from "@/lib/ledger";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Protected: full transaction history for one employee, for the manager
// dashboard's "Employee Ledger" search. Unlike the public
// /api/employees/[id]/transactions endpoint (capped at 20 rows, for the
// homepage), this returns every sale, collection, and contra entry ever
// recorded for the employee, in chronological order, each annotated with
// the running balance immediately after it — so a manager can see exactly
// how the employee's balance got to where it is today, one entry at a time.
//
// The actual computation lives in lib/ledger.ts, shared with the public
// per-employee share link (/api/public/employees/[id]) so the two never
// drift apart.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const ledger = await getEmployeeLedger(employeeId);
  if (!ledger) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  return NextResponse.json(ledger);
}
