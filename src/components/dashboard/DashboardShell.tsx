"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
import EmployeeLedgerTab from "@/components/dashboard/tabs/EmployeeLedgerTab";
import TempSalesTab from "@/components/dashboard/tabs/TempSalesTab";
import SalaryTab from "@/components/dashboard/tabs/SalaryTab";
import AdminTab from "@/components/dashboard/tabs/AdminTab";
import ThemeToggle from "@/components/ThemeToggle";
import { formatMoney } from "@/lib/format";

const TABS = [
  { key: "sale", label: "Sale Entry", short: "Sale", group: "Daily entry", desc: "Book a sale against an employee's account." },
  { key: "collection", label: "Collection Entry", short: "Collection", group: "Daily entry", desc: "Record cash, bKash or bank payments received." },
  { key: "temp_sales", label: "Temp Sales", short: "Temp Sales", group: "Daily entry", desc: "Sell to people without a profile and collect their dues later." },
  { key: "cost", label: "Manager Cost", short: "Cost", group: "Daily entry", desc: "Log the day's running costs and expenses." },
  { key: "bulk", label: "Bulk Upload", short: "Bulk Upload", group: "Daily entry", desc: "Import many sales or collections from a spreadsheet at once." },
  { key: "invoices", label: "Invoices", short: "Invoices", group: "Records", desc: "Generate and share invoices for your customers." },
  { key: "ledger", label: "Employee Ledger", short: "Ledger", group: "Records", desc: "Every sale and collection, employee by employee." },
  { key: "skus", label: "SKUs", short: "SKUs", group: "Records", desc: "Manage your menu items and prices." },
  { key: "salary", label: "Salary", short: "Salary", group: "Records", desc: "Run payroll and track settlements." },
  { key: "analytics", label: "Analytics", short: "Analytics", group: "Insights", desc: "Revenue, products and trends at a glance." },
  { key: "reports", label: "Day-wise Reports", short: "Reports", group: "Insights", desc: "A day-by-day view of everything that happened." },
  { key: "download", label: "Download Reports", short: "Downloads", group: "Insights", desc: "Export clean CSV files for any period." },
  // Not in adminUsers.TAB_KEYS on purpose — it's never one of the tabs a
  // super admin can hand out. Only isSuperAdmin below decides whether this
  // shows up at all.
  { key: "admin", label: "Admin", short: "Admin", group: "Settings", desc: "Control who on your team can see and do what." },
] as const;

const GROUP_ORDER = ["Daily entry", "Records", "Insights", "Settings"] as const;

type TabKey = (typeof TABS)[number]["key"];

type Summary = {
  outstanding: number;
  tempDue?: number;
  advance: number;
  employeeCount: number;
  activeEmployeeCount: number;
};

export default function DashboardShell({
  managerName,
  isSuperAdmin,
  allowedTabs,
}: {
  managerName: string;
  isSuperAdmin: boolean;
  allowedTabs: string[];
}) {
  const visibleTabs = TABS.filter((t) => {
    if (t.key === "admin") return isSuperAdmin;
    return isSuperAdmin || allowedTabs.includes(t.key);
  });
  const canExportReports = isSuperAdmin || allowedTabs.includes("reports") || allowedTabs.includes("download");

  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.key ?? "sale");
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bumpRefresh = () => setRefreshToken((v) => v + 1);
  const selectTab = (key: TabKey) => {
    setTab(key);
    setSidebarOpen(false);
  };

  // Auto-logout: sessions have a fixed lifetime (see src/lib/sessionPolicy.ts)
  // regardless of activity, enforced server-side in src/lib/auth.ts and
  // src/proxy.ts. Providers.tsx polls the session every 5 minutes so a tab
  // left open all shift notices the cutoff on its own; once that poll comes
  // back "unauthenticated" (session expired, not "never logged in" — this
  // component only renders after the server already confirmed a session),
  // send the manager back to the login page instead of leaving them staring
  // at a dashboard where every action will now silently 401.
  const router = useRouter();
  const { status } = useSession();
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?error=SessionExpired");
    }
  }, [status, router]);

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

  // Lock body scroll while the mobile nav drawer is open.
  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const initials =
    managerName
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "M";

  const activeTabMeta = visibleTabs.find((t) => t.key === tab);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[var(--background)]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Pinned on desktop (fixed, not part of the scrolling flow) so it
          stays put while the main column scrolls; on mobile it's the same
          fixed element sliding in/out as a drawer. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--border)] bg-[var(--card)] transition-transform duration-200 ease-out md:z-30 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[image:var(--brand-grad)] text-lg text-white shadow-md">
            ☕
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-tight">BrewHood Coffee</p>
            <p className="bh-eyebrow mt-0.5">Manager Dashboard</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5 md:hidden"
          >
            <XIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {GROUP_ORDER.map((group) => {
            const items = visibleTabs.filter((t) => t.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-4 last:mb-0">
                <p className="bh-eyebrow mb-1.5 px-3">{group}</p>
                <div className="space-y-0.5">
                  {items.map((t) => {
                    const active = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => selectTab(t.key)}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all ${
                          active
                            ? "bg-[var(--brand-soft)] text-[var(--brand-dark)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_22%,transparent)]"
                            : "text-[var(--foreground)]/75 hover:bg-black/[0.04] hover:text-[var(--foreground)] dark:hover:bg-white/5"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                            active
                              ? "bg-[image:var(--brand-grad)] text-white shadow-md"
                              : "bg-black/[0.04] text-[var(--muted)] group-hover:text-[var(--brand)] dark:bg-white/5"
                          }`}
                        >
                          <TabIcon tabKey={t.key} />
                        </span>
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-4">
          <Link
            href="/"
            className="mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-black/5 hover:text-[var(--brand)] dark:hover:bg-white/5"
          >
            <ExternalIcon />
            View Public Ledger
          </Link>
          <div className="flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--brand-grad)] text-xs font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{managerName}</p>
              <p className="truncate text-xs text-[var(--muted)]">{isSuperAdmin ? "Super Admin" : "Team Member"}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Log out"
              aria-label="Log out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-black/10 hover:text-[var(--foreground)] dark:hover:bg-white/10"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:ml-72">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/80 px-4 py-3 backdrop-blur-xl md:px-8">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] md:hidden"
          >
            <MenuIcon />
          </button>
          <div className="mr-auto flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-[var(--muted)] sm:inline">{activeTabMeta?.group ?? "Dashboard"}</span>
            <span className="hidden text-[var(--muted)]/60 sm:inline">/</span>
            <h1 className="truncate text-base font-semibold md:text-[17px]">{activeTabMeta?.label ?? "Dashboard"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visibleTabs.length > 0 && (
              <button
                onClick={() => setAddEmployeeOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <PlusIcon />
                <span className="hidden sm:inline">Add Employee</span>
              </button>
            )}
            {canExportReports && (
              <a
                href="/api/reports/export?type=employees"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <DownloadIcon />
                <span className="hidden sm:inline">Export CSV</span>
              </a>
            )}
            <ThemeToggle />
          </div>
        </header>

        <section className="px-4 pt-5 md:px-8">
          <div className="bh-hero p-4 md:p-5">
            <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="min-w-0 lg:w-64 lg:shrink-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">BrewHood Coffee</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
                  Welcome back, {managerName.trim().split(/\s+/)[0] || "there"}
                </h2>
                <p className="mt-1 text-sm text-amber-50/70">
                  Where your accounts stand today.
                </p>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
                <StatCard
                  label="Total Outstanding"
                  value={summary ? formatMoney(summary.outstanding) : null}
                  sub={summary && summary.tempDue && summary.tempDue > 0 ? `incl. ${formatMoney(summary.tempDue)} temporary` : "owed by customers"}
                  tone="danger"
                  icon={<DueIcon />}
                />
                <StatCard
                  label="Advance Balance"
                  value={summary ? formatMoney(summary.advance) : null}
                  sub="paid in advance"
                  tone="success"
                  icon={<AdvanceIcon />}
                />
                <StatCard
                  label="Employees"
                  value={summary ? String(summary.activeEmployeeCount) : null}
                  sub={summary ? `active of ${summary.employeeCount} total` : undefined}
                  tone="neutral"
                  icon={<PeopleIcon />}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            </div>
          </div>
        </section>

        <main className="flex-1 px-4 py-6 md:px-8">
          {visibleTabs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
              <p className="text-sm font-medium">You don&apos;t have access to any section yet</p>
              <p className="text-sm text-[var(--muted)]">Ask your admin to grant you a tab to get started.</p>
            </div>
          ) : (
            <div key={tab} className="animate-fade-in overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-md)]">
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--brand-soft)] px-4 py-3.5 md:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[image:var(--brand-grad)] text-white shadow-md">
                  <TabIcon tabKey={tab} />
                </span>
                <div className="min-w-0">
                  <h2 className="bh-page-title !text-[1.05rem] truncate">{activeTabMeta?.label}</h2>
                  <p className="truncate text-xs text-[var(--muted)]">{activeTabMeta?.desc}</p>
                </div>
              </div>
              <div className="p-4 md:p-6">
              {tab === "sale" && <SaleEntryTab onSaved={bumpRefresh} />}
              {tab === "collection" && <CollectionEntryTab onSaved={bumpRefresh} />}
              {tab === "temp_sales" && <TempSalesTab onSaved={bumpRefresh} />}
              {tab === "cost" && <ManagerCostTab onSaved={bumpRefresh} />}
              {tab === "bulk" && <BulkUploadTab onSaved={bumpRefresh} />}
              {tab === "invoices" && <InvoiceTab />}
              {tab === "ledger" && <EmployeeLedgerTab />}
              {tab === "analytics" && <AnalyticsTab key={refreshToken} />}
              {tab === "reports" && <ReportsTab />}
              {tab === "download" && <DownloadReportsPanel />}
              {tab === "skus" && <SkusTab />}
              {tab === "salary" && <SalaryTab onSaved={bumpRefresh} />}
              {tab === "admin" && <AdminTab />}
              </div>
            </div>
          )}
        </main>
      </div>

      {addEmployeeOpen && (
        <AddEmployeeModal onClose={() => setAddEmployeeOpen(false)} onImported={bumpRefresh} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  className = "",
}: {
  label: string;
  value: string | null;
  sub?: string;
  tone: "danger" | "success" | "neutral";
  icon: React.ReactNode;
  className?: string;
}) {
  const iconTone =
    tone === "danger"
      ? "bg-rose-400/20 text-rose-200"
      : tone === "success"
        ? "bg-emerald-400/20 text-emerald-200"
        : "bg-amber-300/20 text-amber-100";
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3 ${className}`}>
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${iconTone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.1em] text-amber-100/70">{label}</p>
        {value === null ? (
          <div className="mt-1.5 h-6 w-24 animate-pulse rounded bg-white/15" />
        ) : (
          <p className="truncate text-lg font-semibold leading-tight tracking-tight text-white sm:text-xl">{value}</p>
        )}
        {sub && <p className="truncate text-[11px] text-amber-50/60">{sub}</p>}
      </div>
    </div>
  );
}

function DownloadReportsPanel() {
  const types: { key: string; label: string; desc: string; dateScoped: boolean }[] = [
    { key: "sales", label: "Sales Report", desc: "Every sale entry with employee, item, quantity, and total.", dateScoped: true },
    { key: "collections", label: "Collections Report", desc: "Every collection and contra entry.", dateScoped: true },
    { key: "sales_collections", label: "Combined Sales + Collections", desc: "Sales and collections merged into one chronological log — handy for reconciling a day in a single file.", dateScoped: true },
    { key: "costs", label: "Manager Costs Report", desc: "All manager-logged cost entries.", dateScoped: true },
    { key: "temp_sales", label: "Temp Sales Report", desc: "Sales, payments and adjustments for temporary customers (no profile), with the due after each entry.", dateScoped: true },
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
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand)]"
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Clear range
          </button>
        )}
        <p className="text-xs text-[var(--muted)]">Applies to Sales, Collections, and Manager Costs. Leave blank for everything.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {types.map((t) => (
          <div
            key={t.key}
            className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--brand)]/50 hover:shadow-md"
          >
            <h3 className="font-semibold">{t.label}</h3>
            <p className="mb-4 mt-1 text-sm text-[var(--muted)]">{t.desc}</p>
            {!t.dateScoped && (from || to) && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                This report is a live snapshot, not a dated log — the date range doesn&apos;t apply here.
              </p>
            )}
            <a
              href={reportHref(t.key, t.dateScoped)}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
            >
              <DownloadIcon />
              Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Icons ----------
   Small hand-drawn stroke icons (24x24 grid, currentColor) — no icon
   library dependency, kept minimal on purpose. */

function iconProps() {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function TabIcon({ tabKey }: { tabKey: TabKey }) {
  const p = iconProps();
  switch (tabKey) {
    case "sale":
      return (
        <svg {...p}>
          <circle cx="9" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
          <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
        </svg>
      );
    case "collection":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <circle cx="16" cy="14.5" r="1.4" />
        </svg>
      );
    case "temp_sales":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeDasharray="2.2 2.2" />
        </svg>
      );
    case "cost":
      return (
        <svg {...p}>
          <path d="M6 3h12v16l-2-1.2L14 19l-2-1.2L10 19l-2-1.2L6 19V3Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "bulk":
      return (
        <svg {...p}>
          <path d="M12 15V4M8 8l4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      );
    case "invoices":
      return (
        <svg {...p}>
          <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v4h4" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case "ledger":
      return (
        <svg {...p}>
          <path d="M4 5c3-1.5 6-1.5 8 0v14c-2-1.5-5-1.5-8 0V5Z" />
          <path d="M20 5c-3-1.5-6-1.5-8 0v14c2-1.5 5-1.5 8 0V5Z" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...p}>
          <rect x="4" y="12" width="3.2" height="8" />
          <rect x="10.4" y="7" width="3.2" height="13" />
          <rect x="16.8" y="3" width="3.2" height="17" />
        </svg>
      );
    case "reports":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      );
    case "download":
      return (
        <svg {...p}>
          <path d="M12 4v11M8 11l4 4 4-4" />
          <path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      );
    case "skus":
      return (
        <svg {...p}>
          <path d="M21 8l-9-5-9 5 9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "salary":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <circle cx="12" cy="12.5" r="2.6" />
          <path d="M3 10h2M19 10h2M3 15h2M19 15h2" />
        </svg>
      );
    case "admin":
      return (
        <svg {...p}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

function DueIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </svg>
  );
}

function AdvanceIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M12 21c4.5-3 7-6.5 7-10a7 7 0 1 0-14 0c0 3.5 2.5 7 7 10Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  );
}

function PeopleIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.7 3 2.3 3 5.2" />
    </svg>
  );
}

function PlusIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DownloadIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MenuIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function XIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ExternalIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function LogoutIcon() {
  const p = iconProps();
  return (
    <svg {...p}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
