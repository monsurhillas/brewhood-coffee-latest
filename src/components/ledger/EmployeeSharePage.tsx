"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate, balanceClass, amountClass } from "@/lib/format";
import { drinkTagStyle, type DrinkSlice } from "@/lib/coffeeStats";
import ThemeToggle from "@/components/ThemeToggle";
import { BKASH_NUMBER, paymentReference } from "@/components/ledger/ScanToPayModal";
import CoffeeMug from "@/components/ledger/CoffeeMug";

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
  trx_id: string | null;
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
  drinkBreakdown: DrinkSlice[];
  favoriteDrink: string | null;
};

// Keep the mug + legend readable: show each drink that clears its own
// slice, fold anything past the top few into one "Other" bucket rather than
// crowding the list (the mug itself still renders every slice's true
// share — only this text legend is capped).
const MAX_LEGEND_DRINKS = 4;

export default function EmployeeSharePage({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Keep this simple for an employee checking their own balance: only the
  // most recent 10 entries, and skip pre-import rows entirely (those are
  // an accounting-import detail the manager's own ledger view explains —
  // not something an employee needs to reason about).
  const recentTransactions = data ? data.transactions.filter((t) => t.counted).slice(0, 10) : [];

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

              {data.favoriteDrink && data.drinkBreakdown[0] && (
                <span
                  className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={drinkTagStyle(data.drinkBreakdown[0].mugColor)}
                >
                  ☕ Favourite: {data.favoriteDrink}
                </span>
              )}

              <div className="mt-4 flex items-end justify-between gap-4">
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

                {data.drinkBreakdown.length > 0 && (
                  <div className="flex items-center gap-3">
                    <ul className="flex flex-col items-end gap-1">
                      {data.drinkBreakdown.slice(0, MAX_LEGEND_DRINKS).map((d) => (
                        <li key={d.name} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                          {d.name}
                          <span className="font-medium text-[var(--foreground)]">{d.pct}%</span>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.mugColor }} />
                        </li>
                      ))}
                      {data.drinkBreakdown.length > MAX_LEGEND_DRINKS && (
                        <li className="text-xs text-[var(--muted)]">
                          +{data.drinkBreakdown.length - MAX_LEGEND_DRINKS} more
                        </li>
                      )}
                    </ul>
                    <CoffeeMug slices={data.drinkBreakdown} />
                  </div>
                )}
              </div>

              {/* Embedded directly in the card (not behind a button/modal) so
                  the whole card can be screenshotted and sent to someone —
                  the QR, merchant number and reference are all right here,
                  legible on their own without opening the app. Shown
                  regardless of balance: it doubles as "settle up" and as
                  "give an advance ahead of time". Side-by-side layout keeps
                  this to one compact row instead of a tall stacked block —
                  the QR image is already a tight crop (just the code, no
                  logo/border), so it stays legible at this size. */}
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-black/5 p-3 dark:bg-white/5">
                <img
                  src="/bkash-qr.png"
                  alt="BrewHood Coffee bKash Merchant QR — scan in the bKash app to pay"
                  className="h-36 w-36 shrink-0 rounded-lg border border-[var(--border)] sm:h-40 sm:w-40"
                />
                <div className="min-w-0 text-xs text-[var(--muted)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
                    Pay via bKash
                  </p>
                  <p className="mt-1">
                    Scan, or open <span className="font-medium text-[var(--foreground)]">Payment</span> → Merchant{" "}
                    <span className="font-medium text-[var(--foreground)]">{BKASH_NUMBER}</span>
                  </p>
                  <p className="mt-1">
                    Ref:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {paymentReference({
                        name: data.employee.name,
                        employee_id: data.employee.employee_id,
                        balance: data.currentBalance,
                      })}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Recent Transactions (Last 10)
            </h3>

            {recentTransactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">No transactions yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <ul className="divide-y divide-[var(--border)]">
                  {recentTransactions.map((t) => (
                    <li key={`${t.type}-${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {t.type === "sale"
                            ? `${t.description} × ${t.quantity} @ ${formatMoney(t.unit_price ?? 0)}`
                            : `${(t.method ?? "").toUpperCase()}${t.type === "contra" ? " (reversal)" : ""}`}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{formatDate(t.date)}</p>
                        {t.trx_id && (
                          <p className="truncate font-mono text-xs text-[var(--muted)]">Trx ID: {t.trx_id}</p>
                        )}
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
    </div>
  );
}
