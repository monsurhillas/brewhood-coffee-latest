"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import AddEmployeeModal from "@/components/dashboard/AddEmployeeModal";
import SaleEntryTab from "@/components/dashboard/tabs/SaleEntryTab";
import CollectionEntryTab from "@/components/dashboard/tabs/CollectionEntryTab";
import ManagerCostTab from "@/components/dashboard/tabs/ManagerCostTab";
import AnalyticsTab from "@/components/dashboard/tabs/AnalyticsTab";
import ReportsTab from "@/components/dashboard/tabs/ReportsTab";
import SkusTab from "@/components/dashboard/tabs/SkusTab";
import BulkUploadTab from "@/components/dashboard/tabs/BulkUploadTab";
import InvoiceTab from "@/components/dashboard/tabs/InvoiceTab";
import ThemeToggle from "@/components/ThemeToggle";
import { formatMoney } from "@/lib/format";

const TABS = [
  { key: "sale", label: "Sale Entry" },
  { key: "collection", label: "Collection Entry" },
  { key: "cost", label: "Manager Cost" },
  { key: "bulk", label: "Bulk Upload" },
  { key: "invoices", label: "Invoices" },
  { key: "analytics", label: "Analytics" },
  { key: "reports", label: "Day-wise Reports" },
  { key: "download", label: "Download Reports" },
  { key: "skus", label: "SKUs" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Summary = {
  outstanding: number;
  advance: number;
  employeeCount: number;
  activeEmployeeCount: number;
};

export default function DashboardShell({ managerName }: { managerName: string }) {
  const [tab, setTab] = useState<TabKey>("sale");
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  const bumpRefresh = () => setRefreshToken((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white">☕</div>
            <div>
              <p className="text-sm font-semibold leading-tight">BrewHood Coffee</p>
              <p className="text-xs text-[var(--muted)]">Manager Dashboard · {managerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Public Ledger
            </Link>
            <button
              onClick={() => setAddEmployeeOpen(true)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Add Employee
            </button>
            <a
              href="/api/reports/export?type=employees"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Export CSV
            </a>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Logout
            </button>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap gap-3 px-6 pb-3">
          <SummaryTile
            label="Total Outstanding"
            value={summary ? formatMoney(summary.outstanding) : "…"}
            className="text-amber-600"
          />
          <SummaryTile
            label="Total Advance Balance"
            value={summary ? formatMoney(summary.advance) : "…"}
            className="text-red-500"
          />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        {tab === "sale" && <SaleEntryTab onSaved={bumpRefresh} />}
        {tab === "collection" && <CollectionEntryTab onSaved={bumpRefresh} />}
        {tab === "cost" && <ManagerCostTab onSaved={bumpRefresh} />}
        {tab === "bulk" && <BulkUploadTab onSaved={bumpRefresh} />}
        {tab === "invoices" && <InvoiceTab />}
        {tab === "analytics" && <AnalyticsTab key={refreshToken} />}
        {tab === "reports" && <ReportsTab />}
        {tab === "download" && <DownloadReportsPanel />}
        {tab === "skus" && <SkusTab />}
      </main>

      {addEmployeeOpen && (
        <AddEmployeeModal onClose={() => setAddEmployeeOpen(false)} onImported={bumpRefresh} />
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`text-sm font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function DownloadReportsPanel() {
  const types: { key: string; label: string; desc: string; dateScoped: boolean }[] = [
    { key: "sales", label: "Sales Report", desc: "Every sale entry with employee, item, quantity, and total.", dateScoped: true },
    { key: "collections", label: "Collections Report", desc: "Every collection and contra entry.", dateScoped: true },
    { key: "costs", label: "Manager Costs Report", desc: "All manager-logged cost entries.", dateScoped: true },
    { key: "employees", label: "Employees Report", desc: "Employee directory with running balances.", dateScoped: false },
  ];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function reportHref(key: string, dateScoped: boolean) {
    const params = new URLSearchParams({ type: key });
    if (dateScoped && from) params.set("from", from);
    if (dateScoped && to) params.set("to", to);
    return `/api/reports/export?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
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
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Clear range
          </button>
        )}
        <p className="text-xs text-[var(--muted)]">Applies to Sales, Collections, and Manager Costs. Leave blank for everything.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {types.map((t) => (
          <div key={t.key} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="font-medium">{t.label}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{t.desc}</p>
            {!t.dateScoped && (from || to) && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                This report is a live snapshot, not a dated log — the date range doesn&apos;t apply here.
              </p>
            )}
            <a
              href={reportHref(t.key, t.dateScoped)}
              className="mt-4 inline-block rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
