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

import { sql, ensureSalaryTables, isPaymentMethod, type PaymentMethod } from "@/lib/db";
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

// ---------------------------------------------------------------------------
// Advances <-> Manager Cost
//
// An advance is money that has really left the till, so every advance is
// backed by a Manager Cost row (category "Salary"), linked through
// salary_advances.cost_id. That is what makes a month's Manager Cost total
// for salary = advances + settlement payments. The cost row can be either
// one posted here, or an existing hand-logged Salary cost that gets linked.
// ---------------------------------------------------------------------------

export type AdvanceInput = {
  staffId: number;
  staffName: string;
  month: string; // settlement month YYYY-MM
  amount: number;
  createdAt: string | null; // ISO timestamp, null = now
  method: PaymentMethod;
  note: string | null;
  linkCostId?: number | null; // use this existing cost row
  matchExisting?: boolean; // reuse an equal-amount unassigned Salary cost, if any
};

// A hand-logged Salary cost that isn't tied to an entry or an advance yet.
async function findUnassignedSalaryCost(amount: number): Promise<{ id: number; created_at: string } | null> {
  const rows = (await sql()`
    SELECT mc.id, mc.created_at
    FROM manager_costs mc
    WHERE lower(mc.category) = 'salary' AND mc.salary_entry_id IS NULL AND mc.amount = ${amount}
      AND NOT EXISTS (SELECT 1 FROM salary_advances a WHERE a.cost_id = mc.id)
    ORDER BY mc.created_at DESC
    LIMIT 1
  `) as { id: number; created_at: string }[];
  return rows[0] ?? null;
}

export async function addAdvance(input: AdvanceInput) {
  const db = sql();
  let costId: number | null = input.linkCostId ?? null;
  let createdAt = input.createdAt;
  let autoPosted = false;

  if (costId === null && input.matchExisting) {
    const found = await findUnassignedSalaryCost(input.amount);
    if (found) {
      costId = found.id;
      createdAt = found.created_at;
    }
  }
  if (costId === null) {
    const note = `Salary advance - ${input.staffName} (${monthLabel(input.month)})`;
    const rows = createdAt
      ? await db`
          INSERT INTO manager_costs (category, amount, note, payment_method, created_at)
          VALUES ('Salary', ${input.amount}, ${note}, ${input.method}, ${createdAt})
          RETURNING id, created_at
        `
      : await db`
          INSERT INTO manager_costs (category, amount, note, payment_method)
          VALUES ('Salary', ${input.amount}, ${note}, ${input.method})
          RETURNING id, created_at
        `;
    costId = rows[0].id as number;
    createdAt = rows[0].created_at as string;
    autoPosted = true;
  }

  const rows = createdAt
    ? await db`
        INSERT INTO salary_advances (staff_id, amount, note, month, created_at, cost_id, cost_auto)
        VALUES (${input.staffId}, ${input.amount}, ${input.note}, ${input.month}, ${createdAt}, ${costId}, ${autoPosted})
        RETURNING id, staff_id, amount::float8 AS amount, note, month, created_at, cost_id
      `
    : await db`
        INSERT INTO salary_advances (staff_id, amount, note, month, cost_id, cost_auto)
        VALUES (${input.staffId}, ${input.amount}, ${input.note}, ${input.month}, ${costId}, ${autoPosted})
        RETURNING id, staff_id, amount::float8 AS amount, note, month, created_at, cost_id
      `;
  return rows[0];
}

async function advancesTotal(staffId: number, month: string): Promise<number> {
  const rows = (await sql()`
    SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM salary_advances
    WHERE staff_id = ${staffId} AND month = ${month}
  `) as { total: number }[];
  return round2(rows[0]?.total ?? 0);
}

// An entry can't claim less advance than has already been logged for that
// staff member and month (those advances are real money paid out).
export async function advanceShortfallError(staffId: number, month: string, advance: number): Promise<string | null> {
  const total = await advancesTotal(staffId, month);
  if (advance < total - 0.001) {
    return `Advances already logged for this month total ${total} — remove them from the Advances list first, or keep the advance at ${total} or more.`;
  }
  return null;
}

// After an entry is saved: if its advance figure is more than the advances
// logged so far, the difference is an advance that was given but never
// recorded — record it (and post it to Manager Cost) so the month's salary
// cost is complete.
export async function reconcileEntryAdvances(entry: SalaryEntryRow): Promise<void> {
  const diff = round2(entry.advance_amount - (await advancesTotal(entry.staff_id, entry.month)));
  if (diff <= 0.001) return;
  await addAdvance({
    staffId: entry.staff_id,
    staffName: entry.staff_name,
    month: entry.month,
    amount: diff,
    createdAt: entry.payment_date ? dateStringToTimestamp(entry.payment_date) : null,
    method: entry.payment_method ?? "cash",
    note: null,
    matchExisting: true,
  });
}

// One-time catch-up for data created before advances posted to Manager Cost:
// every advance without a cost row, and every entry whose advance figure
// isn't covered by logged advances, gets its cost row. A row in
// app_migrations is claimed atomically, so concurrent requests can't both run
// it. If an equal-amount Salary cost was already logged by hand it is linked
// rather than duplicated.
let _salaryReady = false;
export async function ensureSalaryReady(): Promise<void> {
  if (_salaryReady) return;
  await ensureSalaryTables();
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now())`;
  const claimed = await db`
    INSERT INTO app_migrations (name) VALUES ('advance_costs_backfill_v1')
    ON CONFLICT (name) DO NOTHING RETURNING name
  `;
  if (claimed.length > 0) {
    try {
      const loose = (await db`
        SELECT a.id, a.amount::float8 AS amount, a.created_at
        FROM salary_advances a WHERE a.cost_id IS NULL ORDER BY a.id
      `) as { id: number; amount: number; created_at: string }[];
      for (const a of loose) {
        const found = await findUnassignedSalaryCost(a.amount);
        let costId: number;
        let auto = false;
        if (found) {
          costId = found.id;
        } else {
          auto = true;
          const [st] = (await db`
            SELECT s.name, adv.month FROM salary_advances adv JOIN staff s ON s.id = adv.staff_id WHERE adv.id = ${a.id}
          `) as { name: string; month: string }[];
          const note = `Salary advance - ${st.name} (${monthLabel(st.month)})`;
          const rows = await db`
            INSERT INTO manager_costs (category, amount, note, payment_method, created_at)
            VALUES ('Salary', ${a.amount}, ${note}, 'cash', ${a.created_at}) RETURNING id
          `;
          costId = rows[0].id as number;
        }
        await db`UPDATE salary_advances SET cost_id = ${costId}, cost_auto = ${auto} WHERE id = ${a.id}`;
      }
      const entries = await listSalaryEntries();
      for (const e of entries) await reconcileEntryAdvances(e);
    } catch (err) {
      await db`DELETE FROM app_migrations WHERE name = 'advance_costs_backfill_v1'`;
      console.error("advance cost backfill failed", err);
      return; // retried on the next request
    }
  }
  _salaryReady = true;
}
