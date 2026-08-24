"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { formatMoney, formatDate, formatRelativeTime } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

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

type ActivityItem = {
  type: "sale" | "collection" | "contra";
  id: number;
  created_at: string;
  label: string;
  quantity: number;
  amount: number;
  employee_name: string;
  employee_code: string;
  is_contra: boolean;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "recent_activity", label: "Recent Activity" },
  { key: "negative_balance", label: "Negative Balance" },
  { key: "all", label: "All Employees" },
  { key: "active_today", label: "Active Today" },
];

function balanceClass(balance: number): string {
  if (balance < 0) return "text-red-500";
  if (balance > 0) return "text-emerald-600";
  return "text-[var(--muted)]";
}

const BKASH_NUMBER = "01744337974";

function paymentReference(employee: Employee): string {
  return `${employee.name} (${employee.employee_id})`;
}

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
    if (status === "recent_activity") return;
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, status]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <header className="relative overflow-hidden bg-[var(--brand-dark)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1.4px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--brand)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: "#000000" }}
        />

        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur">
              ☕
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">BrewHood Coffee</h1>
              <p className="text-xs text-white/70">Employee ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-black/15 p-1 pl-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-full bg-white/95 px-4 py-1.5 text-sm font-medium text-[var(--brand-dark)] transition hover:bg-white"
            >
              Manager Login
            </Link>
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pb-8 pt-6 text-center sm:pt-10">
          <p className="text-4xl sm:text-5xl">☕</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Great coffee, honest tabs.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/75">
            Every cup, every deposit, every balance — tracked in one place for the whole BrewHood
            team.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-8">
        {/* Filter tabs, then search — in that order, in a plain section below the hero */}
        <div className="mt-6 mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
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
          {status !== "recent_activity" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by employee name…"
              className="mt-3 w-full max-w-sm rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          )}
        </div>

        {status === "recent_activity" ? (
          <ActivityFeed />
        ) : (
          <>
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
                        {e.role && <p className="text-xs text-[var(--muted)]">{e.role}</p>}
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
                      <span className={`text-sm font-semibold ${balanceClass(e.balance)}`}>
                        {formatMoney(e.balance)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {selected && <TransactionModal employee={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function articleFor(label: string): string {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function activitySentence(item: ActivityItem): string {
  if (item.type === "sale") {
    if (item.quantity > 1) {
      return `${item.employee_name} ordered ${item.quantity} × ${item.label}!`;
    }
    return `${item.employee_name} ordered ${articleFor(item.label)} ${item.label}!`;
  }
  if (item.type === "collection") {
    return `${item.employee_name} deposited ${formatMoney(item.amount)} advance.`;
  }
  return `${item.employee_name}'s balance was adjusted by ${formatMoney(item.amount)}.`;
}

function activityIcon(item: ActivityItem): string {
  if (item.type === "sale") return "☕";
  if (item.type === "collection") return "💰";
  return "↺";
}

function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetch("/api/activity")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load activity.");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setItems(data.activity ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load recent activity. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="py-12 text-center text-sm text-red-600">{error}</p>;

  if (items === null) {
    return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading recent activity…</p>;
  }

  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--muted)]">No activity yet — check back soon.</p>;
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <ul className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
                item.type === "sale"
                  ? "bg-[var(--brand)]/10"
                  : item.type === "collection"
                  ? "bg-emerald-500/10"
                  : "bg-red-500/10"
              }`}
            >
              {activityIcon(item)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{activitySentence(item)}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{formatRelativeTime(item.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransactionModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [showPay, setShowPay] = useState(false);
  const owesMoney = employee.balance < 0;

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
              Balance{" "}
              <span className={balanceClass(employee.balance)}>{formatMoney(employee.balance)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        {owesMoney && (
          <button
            onClick={() => setShowPay(true)}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#E2136E] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            <span aria-hidden>📱</span> Scan to Pay {formatMoney(-employee.balance)}
          </button>
        )}

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
                  {t.type === "collection" ? "+" : "−"}
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showPay && <ScanToPayModal employee={employee} onClose={() => setShowPay(false)} />}
    </div>
  );
}

function ScanToPayModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const due = -employee.balance;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl bg-[var(--card)] p-6 text-center sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between text-left">
          <div>
            <h2 className="text-base font-semibold">{employee.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              Amount due <span className="font-semibold text-red-500">{formatMoney(due)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        <img
          src="/bkash-qr.png"
          alt="bKash QR code — scan to pay BrewHood Coffee"
          className="mx-auto w-full max-w-[240px] rounded-xl border border-[var(--border)]"
        />

        <p className="mt-3 text-xs text-[var(--muted)]">
          Scan with the bKash app, or Send Money to{" "}
          <span className="font-semibold text-[var(--foreground)]">{BKASH_NUMBER}</span>
        </p>

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-black/5 px-3 py-2 text-left dark:bg-white/5">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Reference — please include</p>
          <p className="text-sm font-medium">{paymentReference(employee)}</p>
        </div>
      </div>
    </div>
  );
}
