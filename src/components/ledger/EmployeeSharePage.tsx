"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate, balanceClass, amountClass } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";
import ScanToPayModal from "@/components/ledger/ScanToPayModal";

type LedgerEmployee = {
  id: number;
  employee_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  has_override: boolean;
};

type LedgerTransaction = {
  type: "sale" | "collection" | "contra";
  id: number;
  date: string;
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
  employee: LedgerEmployee;
  openingBalance: number;
  currentBalance: number;
  totals: { sales: number; collected: number; contra: number; transactionCount: number; preImportCount: number };
  transactions: LedgerTransaction[];
};

export default function EmployeeSharePage({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/employees/${employeeId}`)
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.error ?? "Couldn't load this ledger. Please check the link and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const owesMoney = Boolean(data && data.currentBalance < 0);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="relative overflow-hidden bg-[var(--brand-dark)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1.4px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="relative mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur">
              ☕
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">BrewHood Coffee</h1>
              <p className="text-xs text-white/70">Your personal ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-black/15 p-1 pl-3">
            <ThemeToggle />
            <Link
              href="/"
              className="rounded-full bg-white/95 px-4 py-1.5 text-sm font-medium text-[var(--brand-dark)] transition hover:bg-white"
            >
              Full Directory
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
        {error && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!data && !error && (
          <p className="py-12 text-center text-sm text-[var(--muted)]">Loading your ledger…</p>
        )}

        {data && (
          <>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{data.employee.name}</h2>
                  <p className="text-xs text-[var(--muted)]">
                    #{data.employee.employee_id}
                    {data.employee.role ? ` · ${data.employee.role}` : ""}
                    {!data.employee.active ? " · Inactive" : ""}
                  </p>
                </div>
                {!data.employee.active && (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Current Balance</p>
                  <p className={`text-2xl font-semibold ${balanceClass(data.currentBalance)}`}>
                    {formatMoney(data.currentBalance)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {data.currentBalance < 0
                      ? "You owe the shop"
                      : data.currentBalance > 0
                      ? "The shop owes you"
                      : "Settled up"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Total Sales</p>
                    <p className="text-sm font-medium">{formatMoney(data.totals.sales)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Total Collected</p>
                    <p className="text-sm font-medium">{formatMoney(data.totals.collected)}</p>
                  </div>
                </div>
              </div>

              {owesMoney && (
                <button
                  onClick={() => setShowPay(true)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#E2136E] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <span aria-hidden>📱</span> Scan to Pay {formatMoney(-data.currentBalance)}
                </button>
              )}
            </div>

            {data.totals.preImportCount > 0 && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                {data.totals.preImportCount} of {data.totals.transactionCount} entries below are dated before your
                opening balance was struck — they&apos;re already reflected in it, so they&apos;re shown for the
                record but don&apos;t move the running balance (marked <span className="italic">pre-import</span>{" "}
                below).
              </p>
            )}

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Full Transaction History
            </h3>

            {data.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">No transactions yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <ul className="divide-y divide-[var(--border)]">
                  {data.transactions.map((t) => (
                    <li key={`${t.type}-${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {t.type === "sale"
                            ? `${t.description} × ${t.quantity} @ ${formatMoney(t.unit_price ?? 0)}`
                            : `${(t.method ?? "").toUpperCase()}${t.type === "contra" ? " (reversal)" : ""}`}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatDate(t.date)}
                          {!t.counted && <span className="italic"> · pre-import</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 font-medium ${amountClass(t.type)}`}>
                        {t.type === "collection" ? "+" : "−"}
                        {formatMoney(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-[var(--muted)]">
              This is your personal BrewHood Coffee ledger link. Bookmark it to check your balance anytime.
            </p>
          </>
        )}
      </main>

      {showPay && data && (
        <ScanToPayModal
          employee={{
            name: data.employee.name,
            employee_id: data.employee.employee_id,
            balance: data.currentBalance,
          }}
          onClose={() => setShowPay(false)}
        />
      )}
    </div>
  );
}
