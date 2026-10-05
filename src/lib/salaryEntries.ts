// Shared by /api/salary/entries (+ [id]): validation of a salary entry and —
// the point of the whole feature — keeping manager_costs (category "Salary")
// in step with what an entry says has actually been paid.
//
// An entry is one staff member's settlement for one month: the salary, the
// advance already taken against it, a paid / partial / unpaid status, and the
// payment date + medium. The money that has really left the till is mirrored
// into manager_costs at its payment date, so cost reports, day-wise reports
// and CSV exports pick salaries up with no extra wiring. Each cost row points
// back at its entry via manager_costs.salary_entry_id.
//
// An entry can be topped up later (partial -> paid): the new payment is added
// as its OWN cost row on its own date rather than rewriting the date of the
// earlier one — see syncSalaryCosts.

import { sql, isPaymentMethod, type PaymentMethod } from "@/lib/db";
import { isValidDateString, isFutureDateString, dateStringToTimestamp } from "@/lib/entryDate";
import { monthLabel } from "@/lib/salaryMonth";

export const SALARY_STATUSES = ["paid", "partial", "unpaid"] as const;
export type SalaryStatus = (typeof SALARY_STATUSES)[number];

export type SalaryEntryRow = {
  id: number;
  staff_id: number;
  staff_name: string;
  month: string;
  salary_amount: number;
  advance_amount: number;
  amount_paid: number;
  status: SalaryStatus;
  payment_date: string | null; // YYYY-MM-DD
  payment_method: PaymentMethod | null;
  note: string | null;
};

export type NormalizedEntry = {
  salary_amount: number;
  advance_amount: number;
  amount_paid: number;
  status: SalaryStatus;
  payment_date: string | null;
  payment_method: PaymentMethod | null;
  note: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Validates the user-supplied fields and derives amount_paid from the
// status: paid = the full net (salary - advance), unpaid = nothing, partial =
// what the user typed (strictly between 0 and net). A payment date and
// medium are only required when money actually went out.
export function normalizeEntry(
  input: Record<string, unknown>
): { error: string } | { value: NormalizedEntry } {
  const salary = Number(input.salary_amount);
  const advance = input.advance_amount === undefined || input.advance_amount === "" ? 0 : Number(input.advance_amount);
  if (!Number.isFinite(salary) || salary <= 0) return { error: "Enter the salary amount." };
  if (!Number.isFinite(advance) || advance < 0) return { error: "Advance payment can't be negative." };
  if (advance > salary) return { error: "Advance payment can't be more than the salary." };

  const status = input.status;
  if (typeof status !== "string" || !(SALARY_STATUSES as readonly string[]).includes(status)) {
    return { error: "Status must be paid, partial or unpaid." };
  }

  const net = round2(salary - advance);
  let paid = 0;
  if (status === "paid") {
    paid = net;
  } else if (status === "partial") {
    paid = round2(Number(input.amount_paid));
    if (!Number.isFinite(paid) || paid <= 0 || paid >= net) {
      return { error: `For a partial payment, enter an amount between 0 and ${net}.` };
    }
  }

  let paymentDate: string | null = null;
  let paymentMethod: PaymentMethod | null = null;
  if (paid > 0) {
    const d = input.payment_date;
    if (!isValidDateString(d)) return { error: "Choose the payment date." };
    if (isFutureDateString(d)) return { error: "Payment date can't be in the future." };
    paymentDate = d;
    const m = input.payment_method ?? "cash";
    if (!isPaymentMethod(m)) return { error: "Payment medium must be cash, bkash or bank." };
    paymentMethod = m;
  }

  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  return {
    value: {
      salary_amount: salary,
      advance_amount: advance,
      amount_paid: paid,
      status: status as SalaryStatus,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      note,
    },
  };
}

const ENTRY_SELECT = `
  SELECT se.id, se.staff_id, s.name AS staff_name, se.month,
         se.salary_amount::float8 AS salary_amount, se.advance_amount::float8 AS advance_amount,
         se.amount_paid::float8 AS amount_paid, se.status,
         to_char(se.payment_date, 'YYYY-MM-DD') AS payment_date, se.payment_method, se.note
  FROM salary_entries se JOIN staff s ON s.id = se.staff_id
`;

export async function getSalaryEntry(id: number): Promise<SalaryEntryRow | null> {
  const rows = (await sql().query(`${ENTRY_SELECT} WHERE se.id = $1`, [id])) as SalaryEntryRow[];
  return rows[0] ?? null;
}

export async function listSalaryEntries(): Promise<SalaryEntryRow[]> {
  return (await sql().query(
    `${ENTRY_SELECT} ORDER BY se.month DESC, s.name ASC`
  )) as SalaryEntryRow[];
}

// Brings the Salary cost rows linked to this entry in line with
// entry.amount_paid:
//   - paid more than has been posted so far -> post the difference as a new
//     cost row at the entry's payment date and medium;
//   - paid less (entry edited down, set back to unpaid) -> shave the most
//     recent cost rows back until the totals agree, deleting emptied ones;
//   - same total but a new date/medium -> move the most recent cost row.
// Notes on every linked row are refreshed so a changed name/month stays right.
export async function syncSalaryCosts(entry: SalaryEntryRow): Promise<void> {
  const db = sql();
  const linked = (await db`
    SELECT id, amount::float8 AS amount
    FROM manager_costs WHERE salary_entry_id = ${entry.id}
    ORDER BY created_at ASC, id ASC
  `) as { id: number; amount: number }[];

  const posted = round2(linked.reduce((sum, r) => sum + r.amount, 0));
  const delta = round2(entry.amount_paid - posted);
  const note = `Salary - ${entry.staff_name} (${monthLabel(entry.month)})`;
  const ts = entry.payment_date ? dateStringToTimestamp(entry.payment_date) : null;

  if (delta > 0 && ts) {
    await db`
      INSERT INTO manager_costs (category, amount, note, payment_method, created_at, salary_entry_id)
      VALUES ('Salary', ${delta}, ${note}, ${entry.payment_method}, ${ts}, ${entry.id})
    `;
  } else if (delta < 0) {
    let remaining = -delta;
    for (const row of [...linked].reverse()) {
      if (remaining <= 0.001) break;
      if (row.amount <= remaining + 0.001) {
        await db`DELETE FROM manager_costs WHERE id = ${row.id}`;
        remaining = round2(remaining - row.amount);
      } else {
        await db`UPDATE manager_costs SET amount = ${round2(row.amount - remaining)} WHERE id = ${row.id}`;
        remaining = 0;
      }
    }
  } else if (delta === 0 && linked.length > 0 && ts) {
    const last = linked[linked.length - 1];
    await db`
      UPDATE manager_costs SET created_at = ${ts}, payment_method = ${entry.payment_method}
      WHERE id = ${last.id}
    `;
  }

  await db`UPDATE manager_costs SET note = ${note} WHERE salary_entry_id = ${entry.id}`;
}

// Removing an entry removes the cost rows it posted — otherwise the money
// would stay in the cost reports with nothing explaining it.
export async function deleteSalaryEntry(id: number): Promise<void> {
  const db = sql();
  await db`DELETE FROM manager_costs WHERE salary_entry_id = ${id}`;
  await db`DELETE FROM salary_entries WHERE id = ${id}`;
}
