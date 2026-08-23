"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

type Analytics = {
  totals: {
    total_sales: number;
    total_collected: number;
    total_costs: number;
    employee_count: number;
    active_employee_count: number;
    sale_count: number;
    net: number;
    outstanding: number;
  };
  costBreakdown: { category: string; total: number }[];
  topProducts: { sku_name: string; units_sold: number; revenue: number }[];
  employeeActivity: {
    id: number;
    employee_id: string;
    name: string;
    total_sales: number;
    total_collected: number;
    balance: number;
  }[];
};

export default function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading analytics…</p>;

  const { totals } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Sales" value={formatMoney(totals.total_sales)} />
        <StatCard label="Total Collected" value={formatMoney(totals.total_collected)} />
        <StatCard label="Manager Costs" value={formatMoney(totals.total_costs)} />
        <StatCard label="Net" value={formatMoney(totals.net)} highlight />
        <StatCard label="Outstanding" value={formatMoney(totals.outstanding)} />
        <StatCard label="Employees" value={`${totals.active_employee_count}/${totals.employee_count} active`} />
        <StatCard label="Sale Entries" value={String(totals.sale_count)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="mb-3 font-medium">Cost Breakdown</h2>
          {data.costBreakdown.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No costs logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.costBreakdown.map((c) => (
                <li key={c.category} className="flex items-center justify-between text-sm">
                  <span>{c.category}</span>
                  <span className="font-medium">{formatMoney(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="mb-3 font-medium">Top Selling Products</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No sales yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.topProducts.map((p) => (
                <li key={p.sku_name} className="flex items-center justify-between text-sm">
                  <span>
                    {p.sku_name} <span className="text-[var(--muted)]">×{p.units_sold}</span>
                  </span>
                  <span className="font-medium">{formatMoney(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-medium">Employee Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Employee</th>
                <th className="pb-2 text-right">Sales</th>
                <th className="pb-2 text-right">Collected</th>
                <th className="pb-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.employeeActivity.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2">
                    {e.name} <span className="text-xs text-[var(--muted)]">#{e.employee_id}</span>
                  </td>
                  <td className="py-2 text-right">{formatMoney(e.total_sales)}</td>
                  <td className="py-2 text-right">{formatMoney(e.total_collected)}</td>
                  <td className="py-2 text-right font-medium">{formatMoney(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)] bg-[var(--card)]"
      }`}
    >
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
