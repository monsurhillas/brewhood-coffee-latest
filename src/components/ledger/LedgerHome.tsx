"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/format";

type Employee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  total_sales: number;
  total_collected: number;
  balance: number;
  last_activity_at: string | null;
};

type Transaction = {
  type: "sale" | "collection" | "contra";
  id: number;
  created_at: string;
  amount: number;
  description: string;
  note: string | null;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Employees" },
  { key: "active_today", label: "Active Today" },
  { key: "negative_balance", label: "Negative Balance" },
  { key: "recent_activity", label: "Recent Activity" },
];

export default function LedgerHome() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/employees?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load employees.");
      const data = await res.json();
      setEmployees(data.employees);
    } catch {
      setError("Could not load the employee ledger. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const summary = useMemo(() => {
    const totalDue = employees.reduce((sum, e) => sum + Math.max(e.balance, 0), 0);
    const activeCount = employees.filter((e) => e.active).length;
    return { totalDue, activeCount, count: employees.length };
  }, [employees]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-lg font-semibold text-white">
              ☕
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">BrewHood Coffee</h1>
              <p className="text-xs text-[var(--muted)]">Employee ledger</p>
            </div>
          </div>
          <Link
            href="/login"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Manager Login
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Employees" value={String(summary.count)} />
          <StatTile label="Active" value={String(summary.activeCount)} />
          <StatTile label="Total Outstanding" value={formatMoney(summary.totalDue)} />
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ID, or phone…"
            className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  status === f.key
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-12 text-center text-sm text-[var(--muted)]">Loading ledger…</p>
        ) : employees.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--muted)]">No employees match this view yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {employees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--brand)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      #{e.employee_id} {e.role ? `· ${e.role}` : ""}
                    </p>
                  </div>
                  {!e.active && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-xs text-[var(--muted)]">
                    {e.last_activity_at ? `Last activity ${formatDate(e.last_activity_at)}` : "No activity yet"}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      e.balance > 0 ? "text-amber-600" : e.balance < 0 ? "text-red-500" : "text-emerald-600"
                    }`}
                >
                  {formatMoney(e.balance)}
                </span>
              </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && <TransactionModal employee={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function TransactionModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/employees/${employee.id}/transactions`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTransactions(data.transactions ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--card)] p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{employee.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              #{employee.employee_id} · Balance {formatMoney(employee.balance)}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Transaction History (Last 20)
        </h3>

        {transactions === null ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {transactions.map((t) => (
              <li key={`${t.type}-${t.id}`} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{t.description}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(t.created_at)}</p>
                </div>
                <span
                  className={`font-medium ${
                    t.type === "sale" ? "text-amber-600" : t.type === "contra" ? "text-red-500" : "text-emerald-600"
                  }`}
                >
                  {t.type === "sale" ? "+" : "−"}
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
