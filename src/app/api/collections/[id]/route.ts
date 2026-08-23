import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Financial ledger entries are permanent. This app intentionally does not
// allow editing or deleting a recorded sale/collection/contra entry, so the
// history a manager sees always matches what actually happened. To correct
// a mistake, record a new Contra Entry from the Collection Entry tab — that
// keeps a full, honest audit trail instead of silently rewriting the past.
function disabled() {
  return NextResponse.json(
    {
      error:
        "Editing or deleting ledger entries is disabled to keep the financial history intact. Record a contra entry to correct a mistake instead.",
    },
    { status: 405 }
  );
}

export async function PATCH() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return disabled();
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return disabled();
}
