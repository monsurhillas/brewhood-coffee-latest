import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSalaryReady } from "@/lib/salaryEntries";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Removes a mistaken advance entry. The Manager Cost row the app posted for it
// goes too; a cost row that was only linked (logged by hand earlier) stays in
// Manager Cost and is just unlinked.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  await ensureSalaryReady();
  const db = sql();
  const [adv] = (await db`
    SELECT staff_id, month, amount::float8 AS amount, cost_id, cost_auto FROM salary_advances WHERE id = ${Number(id)}
  `) as { staff_id: number; month: string; amount: number; cost_id: number | null; cost_auto: boolean }[];
  if (adv) {
    const [paid] = await db`
      SELECT id FROM salary_entries WHERE staff_id = ${adv.staff_id} AND month = ${adv.month} AND status = 'paid' LIMIT 1
    `;
    if (paid) {
      return NextResponse.json(
        { error: "That month's salary is already paid — change the advance by editing the salary entry." },
        { status: 400 }
      );
    }
    // Take it back out of a not-yet-paid salary entry for that month, too.
    await db`
      UPDATE salary_entries
      SET advance_amount = GREATEST(0, advance_amount - ${adv.amount})
      WHERE staff_id = ${adv.staff_id} AND month = ${adv.month} AND status <> 'paid'
    `;
  }
  await db`DELETE FROM salary_advances WHERE id = ${Number(id)}`;
  if (adv?.cost_id && adv.cost_auto) await db`DELETE FROM manager_costs WHERE id = ${adv.cost_id}`;
  return NextResponse.json({ ok: true });
}
