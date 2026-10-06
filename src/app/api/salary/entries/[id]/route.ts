import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireTab } from "@/lib/session";
import {
  normalizeEntry,
  getSalaryEntry,
  syncSalaryCosts,
  deleteSalaryEntry,
  advanceShortfallError,
  reconcileEntryAdvances,
  ensureSalaryReady,
} from "@/lib/salaryEntries";

export const dynamic = "force-dynamic";

// Edits an entry (e.g. a partial payment topped up to paid). Staff and month
// are fixed once created. Linked Salary cost rows follow the change.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  const entryId = Number(id);
  const body = await request.json().catch(() => ({}));

  await ensureSalaryReady();
  const existing = await getSalaryEntry(entryId);
  if (!existing) return NextResponse.json({ error: "Salary entry not found." }, { status: 404 });

  const parsed = normalizeEntry({ ...existing, ...body });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const shortfall = await advanceShortfallError(existing.staff_id, existing.month, v.advance_amount);
  if (shortfall) return NextResponse.json({ error: shortfall }, { status: 400 });

  const db = sql();
  await db`
    UPDATE salary_entries SET
      salary_amount = ${v.salary_amount}, advance_amount = ${v.advance_amount},
      amount_paid = ${v.amount_paid}, status = ${v.status},
      payment_date = ${v.payment_date}, payment_method = ${v.payment_method}, note = ${v.note}
    WHERE id = ${entryId}
  `;

  const entry = await getSalaryEntry(entryId);
  if (entry) {
    await syncSalaryCosts(entry);
    await reconcileEntryAdvances(entry);
  }
  return NextResponse.json({ entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  await ensureSalaryReady();
  await deleteSalaryEntry(Number(id));
  return NextResponse.json({ ok: true });
}
