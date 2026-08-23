"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatMoney, formatDay } from "@/lib/format";

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
  dailyTrend: { day: string; sales: number; collections: number; costs: number }[];
  weekdaySeasonality: { weekday: number; sales: number; tx_count: number }[];
  hourlyPattern: { hour: number; sales: number; tx_count: number }[];
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PIE_COLORS = ["#d79a5e", "#6f4518", "#3b82f6", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading analytics…</p>;

  const { totals } = data;

  const weekdayChartData = data.weekdaySeasonality.map((w) => ({
    label: WEEKDAY_LABELS[w.weekday] ?? String(w.weekday),
    sales: w.sales,
    tx_count: w.tx_count,
  }));

  const hourlyChartData = data.hourlyPattern.map((h) => ({
    label: `${String(h.hour).padStart(2, "0")}:00`,
    sales: h.sales,
    tx_count: h.tx_count,
  }));

  const trendChartData = data.dailyTrend.map((d) => ({
    ...d,
    label: formatDay(d.day),
  }));

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

      <ChartCard title="Sales, Collections & Costs Over Time" subtitle="Last 120 days">
        {trendChartData.length === 0 ? (
          <EmptyChart text="No activity yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} width={56} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="sales"
                name="Sales"
                fill="var(--brand)"
                stroke="var(--brand)"
                fillOpacity={0.18}
                strokeWidth={2}
              />
              <Line type="monotone" dataKey="collections" name="Collections" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="costs" name="Costs" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Sales by Day of Week" subtitle="Weekly seasonality">
          {weekdayChartData.every((w) => w.sales === 0) ? (
            <EmptyChart text="No sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekdayChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} width={56} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="sales" name="Sales" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sales by Hour of Day" subtitle="Peak hours">
          {hourlyChartData.every((h) => h.sales === 0) ? (
            <EmptyChart text="No sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hourlyChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} width={56} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="sales" name="Sales" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Cost Breakdown" subtitle="By category">
          {data.costBreakdown.length === 0 ? (
            <EmptyChart text="No costs logged yet." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={220} className="sm:w-1/2">
                <PieChart>
                  <Pie
                    data={data.costBreakdown}
                    dataKey="total"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data.costBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<MoneyTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex w-full flex-col gap-2 sm:w-1/2">
                {data.costBreakdown.map((c, i) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {c.category}
                    </span>
                    <span className="font-medium">{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top Selling Products" subtitle="By revenue">
          {data.topProducts.length === 0 ? (
            <EmptyChart text="No sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, data.topProducts.length * 32)}>
              <BarChart
                data={data.topProducts}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="sku_name"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  width={110}
                />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="var(--brand)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
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

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium">{title}</h2>
        {subtitle && <span className="text-xs text-[var(--muted)]">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-[var(--muted)]">{text}</p>;
}

type TooltipPayloadEntry = {
  name?: string;
  value?: number;
  color?: string;
};

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-[var(--foreground)]">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-medium">{formatMoney(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}
