"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import { formatMoney, formatDate, formatDay } from "@/lib/format";
import { currentMonthInDhaka, monthLabel } from "@/lib/salaryMonth";
import { todayInDhaka } from "@/lib/entryDate";

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
  status: SalaryStatus | null;
  entry_id: number | null;
  paid_amount: number | null;
  payment_date: string | null;
  payable: number;
};

type SalaryStatus = "paid" | "partial" | "unpaid";

type SalaryEntry = {
  id: number;
  staff_id: number;
  staff_name: string;
  month: string;
  salary_amount: number;
  advance_amount: number;
  amount_paid: number;
  status: SalaryStatus;
  payment_date: string | null;
  payment_method: string | null;
  note: string | null;
};

type HistoryPayment = {
  id: number;
  amount: number;
  note: string | null;
  payment_method: string | null;
  date: string;
  entry_id: number | null;
  staff_name: string | null;
};

type HistoryMonth = {
  month: string;
  label: string;
  paid_total: number;
  due_total: number;
  payments: HistoryPayment[];
  entries: SalaryEntry[];
};

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial paid" },
  { value: "unpaid", label: "Unpaid" },
];
const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "bank", label: "Bank" },
];
const methodLabel = (m: string | null) => METHOD_OPTIONS.find((x) => x.value === m)?.label ?? "—";

function StatusBadge({ status, amount }: { status: SalaryStatus | null; amount?: number | null }) {
  if (!status) return <span className="text-xs text-[var(--muted)]">No entry</span>;
  const style =
    status === "paid"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : status === "partial"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
  const label = status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
      {status !== "unpaid" && amount ? ` ${formatMoney(amount)}` : ""}
    </span>
  );
}

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

  // Salary entry form (create, or edit when editingEntryId is set).
  const formRef = useRef<HTMLFormElement>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [formStaffId, setFormStaffId] = useState("");
  const [formMonth, setFormMonth] = useState(currentMonthInDhaka());
  const [formSalary, setFormSalary] = useState("");
  const [formAdvance, setFormAdvance] = useState("");
  const [formStatus, setFormStatus] = useState<SalaryStatus>("paid");
  const [formPaid, setFormPaid] = useState("");
  const [formDate, setFormDate] = useState(todayInDhaka());
  const [formMethod, setFormMethod] = useState("cash");
  const [formNote, setFormNote] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<FormFeedback>(null);

  const [history, setHistory] = useState<HistoryMonth[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function loadStaff() {
    fetch(`/api/salary?month=${month}`)
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((data) => setStaff(data.staff))
      .catch((err) => setError(err?.error ?? "Failed to load salary data."));
  }

  function loadHistory() {
    fetch("/api/salary/history")
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((data) => {
        setHistory(data.months);
        setHistoryError(null);
      })
      .catch((err) => setHistoryError(err?.error ?? "Failed to load salary history."));
  }

  function load() {
    loadStaff();
    loadHistory();
  }

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    loadHistory();
  }, []);

  // New entry: picking a staff member / settlement month prefills the salary
  // (their configured monthly salary) and the advance already logged for that
  // month. Editing an existing entry keeps its own saved figures instead.
  useEffect(() => {
    if (editingEntryId !== null || !formStaffId) return;
    let cancelled = false;
    fetch(`/api/salary?month=${formMonth}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const st = (data.staff as SalaryStaff[] | undefined)?.find((x) => String(x.id) === formStaffId);
        if (!st) return;
        setFormSalary(st.monthly_salary ? String(st.monthly_salary) : "");
        setFormAdvance(st.advances_this_month ? String(st.advances_this_month) : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [formStaffId, formMonth, editingEntryId]);

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

  const formNet = Math.max(0, (Number(formSalary) || 0) - (Number(formAdvance) || 0));

  function resetForm() {
    setEditingEntryId(null);
    setFormStaffId("");
    setFormMonth(month);
    setFormSalary("");
    setFormAdvance("");
    setFormStatus("paid");
    setFormPaid("");
    setFormDate(todayInDhaka());
    setFormMethod("cash");
    setFormNote("");
  }

  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  // "Record Salary" on a staff row: pre-select them for the month on screen.
  function startRecord(st: SalaryStaff) {
    resetForm();
    setFormStaffId(String(st.id));
    setFormMonth(month);
    setFormFeedback(null);
    scrollToForm();
  }

  function startEdit(entry: SalaryEntry) {
    setEditingEntryId(entry.id);
    setFormStaffId(String(entry.staff_id));
    setFormMonth(entry.month);
    setFormSalary(String(entry.salary_amount));
    setFormAdvance(entry.advance_amount ? String(entry.advance_amount) : "");
    setFormStatus(entry.status);
    setFormPaid(entry.status === "partial" ? String(entry.amount_paid) : "");
    setFormDate(entry.payment_date ?? todayInDhaka());
    setFormMethod(entry.payment_method ?? "cash");
    setFormNote(entry.note ?? "");
    setFormFeedback(null);
    scrollToForm();
  }

  function editForStaff(st: SalaryStaff) {
    const entry = history?.flatMap((m) => m.entries).find((x) => x.id === st.entry_id);
    if (entry) startEdit(entry);
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!formStaffId) {
      setFormFeedback({ type: "error", text: "Pick a staff member first." });
      return;
    }
    const salary = Number(formSalary);
    if (!formSalary || Number.isNaN(salary) || salary <= 0) {
      setFormFeedback({ type: "error", text: "Enter the salary amount." });
      return;
    }
    const body: Record<string, unknown> = {
      salary_amount: salary,
      advance_amount: formAdvance ? Number(formAdvance) : 0,
      status: formStatus,
      note: formNote,
    };
    if (formStatus === "partial") body.amount_paid = Number(formPaid);
    if (formStatus !== "unpaid") {
      body.payment_date = formDate;
      body.payment_method = formMethod;
    }
    setFormSaving(true);
    setFormFeedback(null);
    let res: Response;
    if (editingEntryId !== null) {
      res = await fetch(`/api/salary/entries/${editingEntryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch("/api/salary/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, staff_id: Number(formStaffId), month: formMonth }),
      });
    }
    setFormSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormFeedback({ type: "error", text: data.error ?? "Failed to save salary entry." });
      return;
    }
    const posted = formStatus !== "unpaid";
    setFormFeedback({
      type: "success",
      text: editingEntryId !== null
        ? "Salary entry updated."
        : posted
          ? "Salary entry saved and posted to Manager Cost (Salary)."
          : "Salary entry saved as unpaid.",
    });
    resetForm();
    load();
    onSaved?.();
  }

  async function removeEntry(id: number) {
    setConfirmDeleteId(null);
    await fetch(`/api/salary/entries/${id}`, { method: "DELETE" });
    if (editingEntryId === id) resetForm();
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

      <form
        ref={formRef}
        onSubmit={submitEntry}
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">{editingEntryId !== null ? "Edit Salary Entry" : "Salary Entry"}</h2>
            <p className="text-xs text-[var(--muted)]">
              Payments are posted to Manager Cost (Salary) on the payment date.
            </p>
          </div>
          {editingEntryId !== null && (
            <button type="button" onClick={resetForm} className="text-xs text-[var(--muted)] hover:underline">
              Cancel edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Staff</label>
            {editingEntryId !== null ? (
              <p className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                {staff?.find((x) => String(x.id) === formStaffId)?.name ?? "—"}
              </p>
            ) : (
              <ThemedSelect
                value={formStaffId}
                onChange={setFormStaffId}
                placeholder="Select staff…"
                options={(staff ?? []).filter((x) => x.active).map((x) => ({ value: String(x.id), label: x.name }))}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Settlement month</label>
            <input
              type="month"
              value={formMonth}
              disabled={editingEntryId !== null}
              onChange={(e) => e.target.value && setFormMonth(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Salary</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={formSalary}
              onChange={(e) => setFormSalary(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Advance payment</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={formAdvance}
              onChange={(e) => setFormAdvance(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Status</label>
            <ThemedSelect
              value={formStatus}
              onChange={(v) => setFormStatus(v as SalaryStatus)}
              options={STATUS_OPTIONS}
            />
          </div>
          {formStatus === "partial" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Amount paid</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={formPaid}
                onChange={(e) => setFormPaid(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
          )}
          {formStatus !== "unpaid" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Payment date</label>
                <input
                  type="date"
                  value={formDate}
                  max={todayInDhaka()}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Paid via</label>
                <ThemedSelect value={formMethod} onChange={setFormMethod} options={METHOD_OPTIONS} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Note (optional)</label>
            <input value={formNote} onChange={(e) => setFormNote(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-[var(--muted)]">Net payable: </span>
            <span className="font-medium">{formatMoney(formNet)}</span>
            {formStatus === "partial" && Number(formPaid) > 0 && (
              <span className="ml-2 text-xs text-[var(--muted)]">
                · remaining {formatMoney(Math.max(0, formNet - Number(formPaid)))}
              </span>
            )}
          </p>
          <button
            type="submit"
            disabled={formSaving}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {formSaving ? "Saving…" : editingEntryId !== null ? "Update Entry" : "Save Salary Entry"}
          </button>
        </div>
        <FormMessage message={formFeedback} />
      </form>

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
                        <StatusBadge status={s.status} amount={s.paid_amount} />
                        <div className="flex items-center gap-2">
                          {s.status !== "paid" && (
                            <button
                              onClick={() => setAdvanceOpenId(advanceOpenId === s.id ? null : s.id)}
                              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              + Advance
                            </button>
                          )}
                          {s.entry_id ? (
                            <button
                              onClick={() => editForStaff(s)}
                              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              Edit
                            </button>
                          ) : (
                            <button
                              onClick={() => startRecord(s)}
                              disabled={!s.active}
                              className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                            >
                              Record Salary
                            </button>
                          )}
                        </div>
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

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-1 font-medium">Salary History</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Month by month — every salary payment from Manager Cost, plus the entries behind them.
        </p>
        {historyError && <p className="mb-3 text-sm text-red-500">{historyError}</p>}
        {history?.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No salary payments yet.</p>
        )}
        <div className="flex flex-col gap-3">
          {history?.map((m, idx) => {
            const open = openMonths[m.month] ?? idx === 0;
            return (
              <div key={m.month} className="rounded-lg border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setOpenMonths((prev) => ({ ...prev, [m.month]: !open }))}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="font-medium">
                    <span aria-hidden className="mr-1.5 text-xs text-[var(--muted)]">{open ? "▾" : "▸"}</span>
                    {m.label}
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span>
                      <span className="text-xs text-[var(--muted)]">Paid </span>
                      <span className="font-medium">{formatMoney(m.paid_total)}</span>
                    </span>
                    {m.due_total > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        <span className="text-xs">Due </span>
                        <span className="font-medium">{formatMoney(m.due_total)}</span>
                      </span>
                    )}
                  </span>
                </button>

                {open && (
                  <div className="flex flex-col gap-4 border-t border-[var(--border)] px-3 py-3">
                    {m.entries.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {m.entries.map((en) => (
                          <li
                            key={en.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/5"
                          >
                            <div>
                              <span className="font-medium">{en.staff_name}</span>
                              <span className="ml-2 text-xs text-[var(--muted)]">
                                Salary {formatMoney(en.salary_amount)} · Advance {formatMoney(en.advance_amount)} · Paid{" "}
                                {formatMoney(en.amount_paid)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={en.status} />
                              <button onClick={() => startEdit(en)} className="text-xs font-medium hover:underline">
                                Edit
                              </button>
                              {confirmDeleteId === en.id ? (
                                <span className="flex items-center gap-1.5 text-xs">
                                  <button onClick={() => removeEntry(en.id)} className="font-medium text-red-500 hover:underline">
                                    Confirm delete
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-[var(--muted)] hover:underline">
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(en.id)} className="text-xs text-red-500 hover:underline">
                                  Delete
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {m.payments.length > 0 ? (
                      <div className="scroll-fade-x overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                              <th className="pb-2">Date</th>
                              <th className="pb-2">Staff / Note</th>
                              <th className="pb-2">Via</th>
                              <th className="pb-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.payments.map((pm) => (
                              <tr key={pm.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="py-2 whitespace-nowrap">{formatDay(`${pm.date.slice(0, 10)}T12:00:00`)}</td>
                                <td className="py-2">{pm.staff_name ?? pm.note ?? "Salary"}</td>
                                <td className="py-2 text-[var(--muted)]">{methodLabel(pm.payment_method)}</td>
                                <td className="py-2 text-right font-medium">{formatMoney(pm.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">No payments made yet for this month.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
