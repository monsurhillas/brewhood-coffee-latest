"use client";

import { Fragment, useEffect, useState } from "react";
import { formatMoney, formatDate } from "@/lib/format";
import { currentMonthInDhaka, monthLabel } from "@/lib/salaryMonth";

// The shop's own internal staff (baristas, managers, etc) — wholly separate
// from the `employees` table, which represents customers tracked in the
// Employee Ledger. This is the entity the Salary tab's configuration,
// advances, and payouts are keyed against.
type SalaryStaff = {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  monthly_salary: number | null;
  advances_this_month: number;
  paid: boolean;
  paid_amount: number | null;
  paid_at: string | null;
  payable: number;
};

type AdvanceRow = { id: number; amount: number; note: string | null; created_at: string };

// Three compact sections, as requested: Staff (create/manage the shop's own
// internal employees first), Salary Configuration (set each staff member's
// monthly wage — not month-scoped), and Advances & Payable (the running
// mid-month advances against the selected month's payable, with a one-click
// payout that zeroes it). This is a wage concept, kept entirely separate
// from the sales/collections ledger's own "Advance Balance" stat shown on
// the main dashboard — same word, different money — and entirely separate
// from the `employees` (customer) table.
export default function SalaryTab({ onSaved }: { onSaved?: () => void }) {
  const [month, setMonth] = useState(currentMonthInDhaka());
  const [staff, setStaff] = useState<SalaryStaff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [addStaffError, setAddStaffError] = useState<string | null>(null);

  const [editingSalaryId, setEditingSalaryId] = useState<number | null>(null);
  const [editSalaryValue, setEditSalaryValue] = useState("");
  const [salarySaving, setSalarySaving] = useState(false);

  const [advanceOpenId, setAdvanceOpenId] = useState<number | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [advanceDetails, setAdvanceDetails] = useState<AdvanceRow[]>([]);

  const [payingId, setPayingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});

  function load() {
    fetch(`/api/salary?month=${month}`)
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((data) => setStaff(data.staff))
      .catch((err) => setError(err?.error ?? "Failed to load salary data."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Switching months should drop any open advance-detail panel — it's
  // scoped to the month that was showing when it was opened.
  function handleMonthChange(next: string) {
    setMonth(next);
    setExpandedId(null);
    setAdvanceOpenId(null);
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setAddStaffError("Name is required.");
      return;
    }
    setAddingStaff(true);
    setAddStaffError(null);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone || null, role: newRole || null }),
    });
    setAddingStaff(false);
    if (res.ok) {
      setNewName("");
      setNewPhone("");
      setNewRole("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setAddStaffError(data.error ?? "Failed to add staff member.");
    }
  }

  async function toggleStaffActive(s: SalaryStaff) {
    await fetch(`/api/staff/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  }

  function startEditSalary(s: SalaryStaff) {
    setEditingSalaryId(s.id);
    setEditSalaryValue(s.monthly_salary !== null ? String(s.monthly_salary) : "");
  }

  async function saveSalary(s: SalaryStaff) {
    const value = editSalaryValue === "" ? null : Number(editSalaryValue);
    if (value !== null && (Number.isNaN(value) || value < 0)) return;
    setSalarySaving(true);
    const res = await fetch(`/api/staff/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_salary: value }),
    });
    setSalarySaving(false);
    if (res.ok) {
      setEditingSalaryId(null);
      load();
    }
  }

  async function submitAdvance(s: SalaryStaff) {
    const amount = Number(advanceAmount);
    if (!advanceAmount || Number.isNaN(amount) || amount <= 0) {
      setAdvanceError("Enter a valid amount.");
      return;
    }
    setAdvanceSaving(true);
    setAdvanceError(null);
    const res = await fetch("/api/salary/advances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: s.id, amount, month }),
    });
    setAdvanceSaving(false);
    if (res.ok) {
      setAdvanceOpenId(null);
      setAdvanceAmount("");
      load();
      if (expandedId === s.id) loadAdvanceDetails(s.id);
      onSaved?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setAdvanceError(data.error ?? "Failed to record advance.");
    }
  }

  function loadAdvanceDetails(staffId: number) {
    fetch(`/api/salary/advances?staff_id=${staffId}&month=${month}`)
      .then((res) => res.json())
      .then((data) => setAdvanceDetails(data.advances ?? []));
  }

  function toggleExpand(staffId: number) {
    if (expandedId === staffId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(staffId);
    loadAdvanceDetails(staffId);
  }

  async function deleteAdvance(id: number, staffId: number) {
    await fetch(`/api/salary/advances/${id}`, { method: "DELETE" });
    load();
    loadAdvanceDetails(staffId);
  }

  async function paySalary(s: SalaryStaff) {
    setPayingId(s.id);
    setRowError((prev) => ({ ...prev, [s.id]: "" }));
    const res = await fetch("/api/salary/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: s.id, month }),
    });
    setPayingId(null);
    if (res.ok) {
      load();
      onSaved?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setRowError((prev) => ({ ...prev, [s.id]: data.error ?? "Failed to pay salary." }));
    }
  }

  async function undoPay(s: SalaryStaff) {
    setPayingId(s.id);
    await fetch(`/api/salary/pay?staff_id=${s.id}&month=${month}`, { method: "DELETE" });
    setPayingId(null);
    load();
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <form
          onSubmit={handleAddStaff}
          className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <h2 className="font-medium">Add Staff</h2>
          <p className="-mt-2 text-xs text-[var(--muted)]">Your own employees — not customers.</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Phone (optional)</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Role (optional)</label>
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Barista, Manager…"
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          {addStaffError && <p className="text-xs text-red-500">{addStaffError}</p>}
          <button
            type="submit"
            disabled={addingStaff}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {addingStaff ? "Adding…" : "Add Staff"}
          </button>
        </form>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="mb-3 font-medium">Staff</h2>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <div className="scroll-fade-x overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff?.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2">
                      {s.name}
                      {s.phone && <span className="ml-1 text-xs text-[var(--muted)]">· {s.phone}</span>}
                    </td>
                    <td className="py-2 text-[var(--muted)]">{s.role ?? "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => toggleStaffActive(s)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {s.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {staff?.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No staff yet — add your first one.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-1 font-medium">Salary Configuration</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Set each staff member&apos;s monthly salary. Click an amount to edit it.
        </p>
        <div className="scroll-fade-x overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Staff</th>
                <th className="pb-2 text-right">Monthly Salary</th>
              </tr>
            </thead>
            <tbody>
              {staff?.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2">
                    {s.name} {s.role && <span className="text-xs text-[var(--muted)]">· {s.role}</span>}
                  </td>
                  <td className="py-2 text-right">
                    {editingSalaryId === s.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          autoFocus
                          value={editSalaryValue}
                          onChange={(ev) => setEditSalaryValue(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") saveSalary(s);
                            if (ev.key === "Escape") setEditingSalaryId(null);
                          }}
                          className="w-28 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-[var(--brand)]"
                        />
                        <button
                          onClick={() => saveSalary(s)}
                          disabled={salarySaving}
                          className="rounded px-1.5 py-1 text-xs font-medium text-emerald-600 hover:underline disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSalaryId(null)}
                          disabled={salarySaving}
                          className="rounded px-1.5 py-1 text-xs text-[var(--muted)] hover:underline disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditSalary(s)}
                        title="Edit monthly salary"
                        className="rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {s.monthly_salary !== null ? formatMoney(s.monthly_salary) : "Not set"}{" "}
                        <span aria-hidden className="ml-1 text-xs text-[var(--muted)]">✎</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {staff?.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No staff yet.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">Advances &amp; Payable</h2>
            <p className="text-xs text-[var(--muted)]">{monthLabel(month)}</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        <div className="scroll-fade-x overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Staff</th>
                <th className="pb-2 text-right">Salary</th>
                <th className="pb-2 text-right">Advances</th>
                <th className="pb-2 text-right">Payable</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {staff?.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-b border-[var(--border)] last:border-0 align-top">
                    <td className="py-2">
                      {s.name} {s.role && <span className="text-xs text-[var(--muted)]">· {s.role}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {s.monthly_salary !== null ? formatMoney(s.monthly_salary) : <span className="text-xs text-[var(--muted)]">Not set</span>}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => toggleExpand(s.id)}
                        className="rounded px-1 py-0.5 hover:bg-black/5 dark:hover:bg-white/5"
                        title="View advance details"
                      >
                        {formatMoney(s.advances_this_month)}
                      </button>
                    </td>
                    <td className={`py-2 text-right font-medium ${s.payable < 0 ? "text-red-500" : ""}`}>
                      {formatMoney(s.payable)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {s.paid ? (
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Paid {formatMoney(s.paid_amount ?? 0)}
                            </span>
                            <button
                              onClick={() => undoPay(s)}
                              disabled={payingId === s.id}
                              className="text-xs text-[var(--muted)] hover:underline disabled:opacity-60"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setAdvanceOpenId(advanceOpenId === s.id ? null : s.id)}
                              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              + Advance
                            </button>
                            <button
                              onClick={() => paySalary(s)}
                              disabled={payingId === s.id || !s.monthly_salary}
                              className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                            >
                              {payingId === s.id ? "Paying…" : "Pay Salary"}
                            </button>
                          </div>
                        )}
                        {rowError[s.id] && <p className="text-xs text-red-500">{rowError[s.id]}</p>}
                      </div>
                    </td>
                  </tr>

                  {advanceOpenId === s.id && (
                    <tr className="border-b border-[var(--border)] last:border-0 bg-black/5 dark:bg-white/5">
                      <td colSpan={5} className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            autoFocus
                            placeholder="Advance amount"
                            value={advanceAmount}
                            onChange={(ev) => setAdvanceAmount(ev.target.value)}
                            onKeyDown={(ev) => ev.key === "Enter" && submitAdvance(s)}
                            className="w-36 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:border-[var(--brand)]"
                          />
                          <button
                            onClick={() => submitAdvance(s)}
                            disabled={advanceSaving}
                            className="rounded-lg bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {advanceSaving ? "Saving…" : "Record Advance"}
                          </button>
                          <button
                            onClick={() => {
                              setAdvanceOpenId(null);
                              setAdvanceError(null);
                            }}
                            className="text-xs text-[var(--muted)] hover:underline"
                          >
                            Cancel
                          </button>
                          {advanceError && <p className="text-xs text-red-500">{advanceError}</p>}
                        </div>
                      </td>
                    </tr>
                  )}

                  {expandedId === s.id && (
                    <tr className="border-b border-[var(--border)] last:border-0">
                      <td colSpan={5} className="px-2 pb-3">
                        {advanceDetails.length === 0 ? (
                          <p className="py-1 text-xs text-[var(--muted)]">No advances recorded this month.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {advanceDetails.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                                <span>
                                  {formatDate(a.created_at)} {a.note ? `— ${a.note}` : ""}
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className="font-medium text-[var(--foreground)]">{formatMoney(a.amount)}</span>
                                  <button
                                    onClick={() => deleteAdvance(a.id, s.id)}
                                    className="text-red-500 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {staff?.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No staff yet.</p>}
        </div>
      </div>
    </div>
  );
}
