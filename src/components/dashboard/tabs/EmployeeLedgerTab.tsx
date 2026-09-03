"use client";

import { useEffect, useMemo, useState } from "react";
import EmployeePicker, { EmployeeOption } from "@/components/dashboard/EmployeePicker";
import { formatMoney, formatDate, balanceClass, amountClass } from "@/lib/format";

type Employee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  has_override: boolean;
};

type Transaction = {
  type: "sale" | "collection" | "contra";
  id: number;
  date: string;
  uploaded_at: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  method: string | null;
  note: string | null;
  counted: boolean;
  balance_after: number | null;
};

type LedgerResponse = {
  employee: Employee;
  openingBalance: number;
  currentBalance: number;
  totals: { sales: number; collected: number; contra: number; transactionCount: number; preImportCount: number };
  transactions: Transaction[];
};

function typeBadgeClass(type: Transaction["type"]): string {
  if (type === "collection") return "bg-emerald-500/15 text-emerald-600";
  return "bg-red-500/15 text-red-500";
}

export default function EmployeeLedgerTab() {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // The link is always shown in a plain, selectable field below (see
  // render) so sharing it never depends on the Clipboard API working —
  // some browsers restrict or silently hang navigator.clipboard.writeText
  // outside a few narrow conditions. This button is just a convenience on
  // top of that: try to copy, and if it doesn't resolve, do nothing
  // disruptive (no blocking window.prompt) since the field is right there.
  async function copyShareLink() {
    if (!employee) return;
    const url = `${window.location.origin}/e/${employee.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write unavailable — the visible link field is the fallback.
    }
  }

  // No separate "loading" flag: data is reset to null (and error cleared)
  // the moment a new employee is picked (see EmployeePicker's onSelect
  // below), so "employee selected but data still null and no error yet" is
  // itself the loading state — avoids setting state synchronously at the
  // top of this effect, which would otherwise trigger an extra render.
  const loading = Boolean(employee) && !data && !error;

  useEffect(() => {
    if (!employee) {
      return;
    }
    let cancelled = false;
    fetch(`/api/employees/${employee.id}/ledger`)
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.error ?? "Failed to load transaction history.");
      });
    return () => {
      cancelled = true;
    };
  }, [employee]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter((t) => {
      if (from && t.date < `${from}T00:00:00.000Z`) return false;
      if (to && t.date > `${to}T23:59:59.999Z`) return false;
      if (query) {
        const hay = `${t.description ?? ""} ${t.method ?? ""} ${t.note ?? ""} ${t.type}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, from, to, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-3 font-medium">Employee Ledger</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Search an employee by name or ID to see their complete transaction history — every sale,
          collection, and contra entry ever recorded for them, oldest mistakes and all, with the
          running balance after each one.
        </p>
        <div className="max-w-sm">
          <EmployeePicker
            selected={employee}
            onSelect={(next) => {
              setEmployee(next);
              setData(null);
              setError(null);
            }}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Loading transaction history…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Employee" value={data.employee.name} sub={`#${data.employee.employee_id}${data.employee.active ? "" : " · Inactive"}`} />
            <SummaryCard
              label="Opening Balance"
              value={formatMoney(data.openingBalance)}
              valueClassName={balanceClass(data.openingBalance)}
              sub={data.employee.has_override ? "Carried over from import" : "No prior balance"}
            />
            <SummaryCard label="Total Sales" value={formatMoney(data.totals.sales)} sub="Since opening balance" />
            <SummaryCard label="Total Collected" value={formatMoney(data.totals.collected)} sub={data.totals.contra ? `incl. ${formatMoney(data.totals.contra)} contra` : "Since opening balance"} />
            <SummaryCard
              label="Current Balance"
              value={formatMoney(data.currentBalance)}
              valueClassName={balanceClass(data.currentBalance)}
              sub={data.currentBalance < 0 ? "Owes the shop" : data.currentBalance > 0 ? "Shop owes employee" : "Settled"}
            />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <p className="mb-2 text-xs text-[var(--muted)]">
              Share {data.employee.name}&apos;s own link so they can check their balance and pay directly — no login
              needed.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}/e/${data.employee.id}` : ""}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={copyShareLink}
                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                {copied ? "Link copied ✓" : "Copy"}
              </button>
            </div>
          </div>

          {data.totals.preImportCount > 0 && (
            <p className="text-xs text-[var(--muted)]">
              {data.totals.preImportCount} of {data.totals.transactionCount} entries below are dated before this
              employee&apos;s opening balance was struck — they&apos;re already reflected in it, so they&apos;re shown for
              the record but don&apos;t move the running balance (marked <span className="italic">pre-import</span>{" "}
              below).
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Filter (item, method, note)</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. cash, Americano, bulk…"
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            {(from || to || query) && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setQuery("");
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                Clear filters
              </button>
            )}
            <span className="text-xs text-[var(--muted)]">
              {filtered.length} of {data.transactions.length} entries
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance After</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                      No transactions match these filters.
                    </td>
                  </tr>
                )}
                {filtered.map((t) => (
                  <tr key={`${t.type}-${t.id}`} className="border-b border-[var(--border)] last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted)]">{formatDate(t.date)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${typeBadgeClass(t.type)}`}>
                        {t.type}
                      </span>
                      {!t.counted && (
                        <span
                          className="ml-1 rounded bg-black/5 px-1.5 py-0.5 text-[10px] italic text-[var(--muted)] dark:bg-white/10"
                          title="Dated before this employee's opening balance was struck — already reflected in it, so it isn't applied again here."
                        >
                          pre-import
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.type === "sale"
                        ? `${t.description} × ${t.quantity} @ ${formatMoney(t.unit_price ?? 0)}`
                        : `${(t.method ?? "").toUpperCase()}${t.type === "contra" ? " (reversal)" : ""}`}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${amountClass(t.type)}`}>
                      {t.type === "sale" ? "-" : t.type === "contra" ? "-" : "+"}
                      {formatMoney(t.amount)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${t.counted ? balanceClass(t.balance_after ?? 0) : "text-[var(--muted)]"}`}>
                      {t.counted ? formatMoney(t.balance_after ?? 0) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">{t.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!employee && !loading && (
        <p className="text-sm text-[var(--muted)]">Search for an employee above to see their ledger.</p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`truncate text-lg font-semibold ${valueClassName ?? ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}
