"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import AddEmployeeModal from "@/components/dashboard/AddEmployeeModal";
import SaleEntryTab from "@/components/dashboard/tabs/SaleEntryTab";
import CollectionEntryTab from "@/components/dashboard/tabs/CollectionEntryTab";
import ManagerCostTab from "@/components/dashboard/tabs/ManagerCostTab";
import AnalyticsTab from "@/components/dashboard/tabs/AnalyticsTab";
import ReportsTab from "@/components/dashboard/tabs/ReportsTab";
import SkusTab from "@/components/dashboard/tabs/SkusTab";

const TABS = [
  { key: "sale", label: "Sale Entry" },
  { key: "collection", label: "Collection Entry" },
  { key: "cost", label: "Manager Cost" },
  { key: "analytics", label: "Analytics" },
  { key: "reports", label: "Day-wise Reports" },
  { key: "download", label: "Download Reports" },
  { key: "skus", label: "SKUs" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DashboardShell({ managerName }: { managerName: string }) {
  const [tab, setTab] = useState<TabKey>("sale");
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const bumpRefresh = () => setRefreshToken((v) => v + 1);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
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
          </div>
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

function DownloadReportsPanel() {
  const types: { key: string; label: string; desc: string }[] = [
    { key: "sales", label: "Sales Report", desc: "Every sale entry with employee, item, quantity, and total." },
    { key: "collections", label: "Collections Report", desc: "Every collection and contra entry." },
    { key: "costs", label: "Manager Costs Report", desc: "All manager-logged cost entries." },
    { key: "employees", label: "Employees Report", desc: "Employee directory with running balances." },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {types.map((t) => (
        <div key={t.key} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="font-medium">{t.label}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.desc}</p>
          <a
            href={`/api/reports/export?type=${t.key}`}
            className="mt-4 inline-block rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Download CSV
          </a>
        </div>
      ))}
    </div>
  );
}
