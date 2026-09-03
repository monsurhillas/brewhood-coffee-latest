"use client";

import { useEffect, useState } from "react";
import { formatMoney, formatDay, formatDate, amountClass } from "@/lib/format";

type DayRow = {
  day: string;
  sales_total: number;
  collections_total: number;
  costs_total: number;
  tx_count: number;
};

type DayTransaction = {
  type: "sale" | "collection" | "contra" | "cost";
  id: number;
  created_at: string;
  amount: number;
  description: string;
  note: string | null;
  employee_name: string | null;
};

export default function ReportsTab() {
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/daily")
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 font-medium">Day-wise Reports</h2>
      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
      ) : days.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">No activity recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Date</th>
                <th className="pb-2 text-right">Sales</th>
                <th className="pb-2 text-right">Collected</th>
                <th className="pb-2 text-right">Costs</th>
                <th className="pb-2 text-right">Entries</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr
                  key={d.day}
                  onClick={() => setSelectedDay(d.day)}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <td className="py-2 font-medium">{formatDay(d.day)}</td>
                  <td className="py-2 text-right">{formatMoney(d.sales_total)}</td>
                  <td className="py-2 text-right">{formatMoney(d.collections_total)}</td>
                  <td className="py-2 text-right">{formatMoney(d.costs_total)}</td>
                  <td className="py-2 text-right">{d.tx_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDay && <DayModal day={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

function DayModal({ day, onClose }: { day: string; onClose: () => void }) {
  const [transactions, setTransactions] = useState<DayTransaction[] | null>(null);

  useEffect(() => {
    fetch(`/api/reports/daily?date=${day}`)
      .then((res) => res.json())
      .then((data) => setTransactions(data.transactions ?? []));
  }, [day]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--card)] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">{formatDay(day)}</h3>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>
        {transactions === null ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No transactions on this day.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {transactions.map((t) => (
              <li key={`${t.type}-${t.id}`} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">
                    {t.description} {t.employee_name ? `· ${t.employee_name}` : ""}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(t.created_at)}</p>
                </div>
                <span className={`font-medium ${amountClass(t.type)}`}>{formatMoney(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
