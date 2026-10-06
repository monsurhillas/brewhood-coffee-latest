import { NextResponse } from "next/server";
import { sql, ensureSalaryTables } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Removes a mistaken advance entry. If the advance was linked to a Manager
// Cost row, only the link goes — the cost itself stays in Manager Cost.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  await ensureSalaryTables();
  const db = sql();
  const [adv] = (await db`
    SELECT staff_id, month, amount::float8 AS amount FROM salary_advances WHERE id = ${Number(id)}
  `) as { staff_id: number; month: string; amount: number }[];
  if (adv) {
    // Take it back out of a not-yet-paid salary entry for that month, too.
    await db`
      UPDATE salary_entries
      SET advance_amount = GREATEST(0, advance_amount - ${adv.amount})
      WHERE staff_id = ${adv.staff_id} AND month = ${adv.month} AND status <> 'paid'
    `;
  }
  await db`DELETE FROM salary_advances WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
