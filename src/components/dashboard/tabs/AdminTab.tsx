"use client";

import { useEffect, useState } from "react";
import { formatDate, formatRelativeTime } from "@/lib/format";

type TabKey = string;

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  is_super_admin: boolean;
  allowed_tabs: TabKey[];
  active: boolean;
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
};

// Human-friendly labels for the tab keys stored in the DB — keep in sync
// with DashboardShell's TABS array.
const TAB_LABELS: Record<string, string> = {
  sale: "Sale Entry",
  collection: "Collection Entry",
  temp_sales: "Temp Sales",
  cost: "Manager Cost",
  bulk: "Bulk Upload",
  invoices: "Invoices",
  ledger: "Employee Ledger",
  analytics: "Analytics",
  reports: "Day-wise Reports",
  download: "Download Reports",
  skus: "SKUs",
  salary: "Salary",
};

// Sections grouped by what a person does there, so handing out access reads
// as "can they take orders? see money? see numbers?" rather than a flat list
// of twelve tab names. Any key the server knows about but isn't listed here
// still shows up, under "Other".
const GROUPS: { title: string; hint: string; keys: string[] }[] = [
  { title: "Daily entry", hint: "Record sales, dues and costs", keys: ["sale", "collection", "temp_sales", "cost", "bulk"] },
  { title: "Records", hint: "Ledgers, invoices, salary, items", keys: ["ledger", "invoices", "salary", "skus"] },
  { title: "Insights", hint: "Reports and analytics", keys: ["analytics", "reports", "download"] },
];

// One-click starting points; they only pre-select sections, and every
// section can still be toggled individually afterwards.
const PRESETS: { label: string; hint: string; keys: string[] | "all" }[] = [
  { label: "Cashier", hint: "Sales, collections, temp sales", keys: ["sale", "collection", "temp_sales"] },
  { label: "Accountant", hint: "Costs, salary, invoices, reports", keys: ["cost", "salary", "invoices", "ledger", "reports", "download"] },
  { label: "Analyst", hint: "Analytics and reports", keys: ["analytics", "reports", "download", "ledger"] },
  { label: "Full access", hint: "Every section", keys: "all" },
];

function SectionIcon({ tabKey }: { tabKey: string }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
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
        </svg>
      );
    case "salary":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <circle cx="12" cy="12.5" r="2.6" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Icon({ name }: { name: "users" | "check" | "pause" | "clock" | "plus" | "search" | "crown" | "chevron" | "close" }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "users":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
          <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 5.2" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.2l2.4 2.4 4.6-5.2" />
        </svg>
      );
    case "pause":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 9v6M14 9v6" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "plus":
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      );
    case "crown":
      return (
        <svg {...p} width={13} height={13}>
          <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...p} width={14} height={14}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "close":
      return (
        <svg {...p} width={16} height={16}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
  }
}

// Stable, pleasant avatar colour per person, derived from their email.
function avatarStyle(seed: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 55% 52%), hsl(${(h + 38) % 360} 60% 42%))` };
}

function initials(u: { name: string | null; email: string }): string {
  const base = (u.name || u.email.split("@")[0]).trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ user, size = 44 }: { user: AdminUser; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm"
      style={{ ...avatarStyle(user.email), width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(user)}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

// The grouped section picker, shared by "add team member" and each person's
// access editor.
function AccessPicker({
  tabKeys,
  selected,
  onToggle,
  onApply,
}: {
  tabKeys: TabKey[];
  selected: Set<TabKey>;
  onToggle: (tab: TabKey) => void;
  onApply: (keys: TabKey[]) => void;
}) {
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const groups = [
    ...GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => tabKeys.includes(k)) })),
    { title: "Other", hint: "", keys: tabKeys.filter((k) => !known.has(k)) },
  ].filter((g) => g.keys.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              title={p.hint}
              onClick={() => onApply(p.keys === "all" ? tabKeys : p.keys.filter((k) => tabKeys.includes(k)))}
              className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-medium transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{g.title}</p>
            {g.hint && <p className="text-[11px] text-[var(--muted)]/80">{g.hint}</p>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.keys.map((tab) => {
              const on = selected.has(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggle(tab)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    on
                      ? "border-[var(--brand)]/60 bg-[var(--brand)]/10 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--background)] text-[var(--muted)] hover:border-[var(--brand)]/40"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      on ? "bg-[var(--brand)] text-white" : "bg-black/5 dark:bg-white/10"
                    }`}
                  >
                    <SectionIcon tabKey={tab} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{TAB_LABELS[tab] ?? tab}</span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border)]"
                    }`}
                  >
                    {on && <CheckIcon />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  tone: "brand" | "green" | "amber" | "blue";
}) {
  const tones = {
    brand: "bg-[var(--brand)]/12 text-[var(--brand)]",
    green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    blue: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
        {value === null ? (
          <div className="mt-1 h-6 w-10 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        ) : (
          <p className="text-xl font-semibold leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

type StatusFilter = "all" | "active" | "disabled";

export default function AdminTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [tabKeys, setTabKeys] = useState<TabKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newTabs, setNewTabs] = useState<Set<TabKey>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  function flash(type: "success" | "error", text: string) {
    setNotice({ type, text });
    setTimeout(() => setNotice((n) => (n && n.text === text ? null : n)), 3500);
  }

  function load() {
    return fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((data) => {
        setUsers(data.users);
        setTabKeys(data.tabKeys);
        setLoadedAt(Date.now());
        setError(null);
      })
      .catch((err) => setError(err?.error ?? "Failed to load users."));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (newTabs.size === 0) {
      setAddError("Pick at least one section — or choose a preset above.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          name: newName || undefined,
          allowedTabs: Array.from(newTabs),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      flash("success", `${newName || newEmail} can now sign in with Google.`);
      setNewEmail("");
      setNewName("");
      setNewTabs(new Set());
      setShowAdd(false);
      await load();
    } catch (err) {
      setAddError((err as { error?: string })?.error ?? "Failed to add user.");
    } finally {
      setAdding(false);
    }
  }

  // Optimistic: the card updates immediately, and rolls back (with a message)
  // if the server refuses.
  async function patchUser(user: AdminUser, change: Partial<Pick<AdminUser, "allowed_tabs" | "active">>, okText?: string) {
    const before = users;
    setUsers((list) => list && list.map((u) => (u.id === user.id ? { ...u, ...change } : u)));
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(change.allowed_tabs ? { allowedTabs: change.allowed_tabs } : {}),
          ...(change.active !== undefined ? { active: change.active } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't save that change.");
      }
      if (okText) flash("success", okText);
    } catch (err) {
      setUsers(before);
      flash("error", err instanceof Error ? err.message : "Couldn't save that change.");
    }
  }

  function toggleTab(user: AdminUser, tab: TabKey) {
    const next = new Set(user.allowed_tabs);
    if (next.has(tab)) next.delete(tab);
    else next.add(tab);
    if (next.size === 0) {
      flash("error", "Keep at least one section — disable the person instead if they shouldn't have access.");
      return;
    }
    patchUser(user, { allowed_tabs: Array.from(next) });
  }

  function applyPreset(user: AdminUser, keys: TabKey[]) {
    if (keys.length === 0) return;
    patchUser(user, { allowed_tabs: keys }, `Access updated for ${user.name || user.email}.`);
  }

  function toggleActive(user: AdminUser) {
    patchUser(
      user,
      { active: !user.active },
      user.active ? `${user.name || user.email} is disabled and can't sign in.` : `${user.name || user.email} can sign in again.`
    );
  }

  async function handleRemove(user: AdminUser) {
    setConfirmRemove(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      flash("success", `${user.name || user.email} was removed.`);
      await load();
    } catch {
      flash("error", "Couldn't remove that person.");
    }
  }

  const all = users ?? [];
  const activeCount = all.filter((u) => u.active).length;
  const disabledCount = all.length - activeCount;
  const recentCount = all.filter(
    (u) => u.last_login_at && loadedAt - new Date(u.last_login_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

  const q = query.trim().toLowerCase();
  const visible = all.filter((u) => {
    if (filter === "active" && !u.active) return false;
    if (filter === "disabled" && u.active) return false;
    return !q || `${u.name ?? ""} ${u.email}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--brand)]/15 via-[var(--card)] to-[var(--card)] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--brand)]/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--brand)]">Admin</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Team &amp; access</h2>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Invite someone by their Google account and choose exactly which sections they can see. You&apos;re the super
              admin — you always have full access and can&apos;t be restricted or removed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            {showAdd ? <Icon name="close" /> : <Icon name="plus" />}
            {showAdd ? "Close" : "Add team member"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Team members" value={users ? all.length : null} icon={<Icon name="users" />} tone="brand" />
        <StatTile label="Active" value={users ? activeCount : null} icon={<Icon name="check" />} tone="green" />
        <StatTile label="Disabled" value={users ? disabledCount : null} icon={<Icon name="pause" />} tone="amber" />
        <StatTile label="Signed in this week" value={users ? recentCount : null} icon={<Icon name="clock" />} tone="blue" />
      </div>

      {notice && (
        <div
          role="status"
          className={`animate-fade-in rounded-xl border px-4 py-2.5 text-sm ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="animate-fade-in flex flex-col gap-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
        >
          <div>
            <h3 className="font-semibold">Invite a team member</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">They sign in with this Google account — no password to share.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
              Google account email
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="someone@example.com"
                className="rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
              Name (optional)
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Their name"
                className="rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              />
            </label>
          </div>

          <AccessPicker
            tabKeys={tabKeys}
            selected={newTabs}
            onToggle={(tab) => {
              const next = new Set(newTabs);
              if (next.has(tab)) next.delete(tab);
              else next.add(tab);
              setNewTabs(next);
            }}
            onApply={(keys) => setNewTabs(new Set(keys))}
          />

          {addError && <p className="text-sm text-red-500">{addError}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted)]">
              {newTabs.size === 0 ? "No sections selected yet" : `${newTabs.size} of ${tabKeys.length} sections selected`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add team member"}
              </button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-300">{error}</p>
      )}

      {/* Toolbar */}
      {users && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <Icon name="search" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-10 pr-3 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 text-xs font-medium">
            {(
              [
                ["all", `All (${all.length})`],
                ["active", `Active (${activeCount})`],
                ["disabled", `Disabled (${disabledCount})`],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 transition ${
                  filter === key ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {!users && !error && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
          ))}
        </div>
      )}

      {/* People */}
      {users && visible.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">{all.length === 0 ? "No team members yet" : "No one matches"}</p>
          <p className="text-xs text-[var(--muted)]">
            {all.length === 0 ? "Add the first person to give them access." : "Try a different search or filter."}
          </p>
        </div>
      )}

      {users && visible.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {visible.map((u) => {
            const granted = u.is_super_admin ? tabKeys : u.allowed_tabs.filter((t) => tabKeys.includes(t));
            const pct = tabKeys.length ? Math.round((granted.length / tabKeys.length) * 100) : 0;
            const isEditing = editing === u.id;
            return (
              <div
                key={u.id}
                className={`rounded-2xl border bg-[var(--card)] shadow-sm transition ${
                  u.active ? "border-[var(--border)]" : "border-dashed border-[var(--border)]"
                }`}
              >
                <div className={`flex flex-col gap-4 p-5 ${u.active ? "" : "opacity-70"}`}>
                  <div className="flex items-start gap-3">
                    <Avatar user={u} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate font-semibold">{u.name || u.email}</p>
                        {u.is_super_admin ? (
                          <span className="flex items-center gap-1 rounded-full bg-[var(--brand)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                            <Icon name="crown" /> Super admin
                          </span>
                        ) : !u.active ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Disabled
                          </span>
                        ) : null}
                      </div>
                      {u.name && <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>}
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        {u.last_login_at ? (
                          <span title={formatDate(u.last_login_at)}>Last active {formatRelativeTime(u.last_login_at)}</span>
                        ) : (
                          "Hasn’t signed in yet"
                        )}
                        {u.created_by && !u.is_super_admin && <span> · added by {u.created_by}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Access summary */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium">{u.is_super_admin ? "Full access to every section" : "Section access"}</span>
                      <span className="text-[var(--muted)]">
                        {granted.length} of {tabKeys.length}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {!u.is_super_admin && !isEditing && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {granted.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">No sections</span>
                        ) : (
                          granted.map((t) => (
                            <span
                              key={t}
                              className="flex items-center gap-1 rounded-full bg-[var(--brand)]/10 px-2 py-1 text-[11px] font-medium text-[var(--brand)]"
                            >
                              <SectionIcon tabKey={t} /> {TAB_LABELS[t] ?? t}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  {!u.is_super_admin && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                      <button
                        type="button"
                        onClick={() => setEditing(isEditing ? null : u.id)}
                        aria-expanded={isEditing}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                      >
                        {isEditing ? "Done" : "Edit access"}
                        <span className={`transition-transform ${isEditing ? "rotate-180" : ""}`}>
                          <Icon name="chevron" />
                        </span>
                      </button>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          <Switch checked={u.active} onChange={() => toggleActive(u)} label={`${u.active ? "Disable" : "Enable"} ${u.name || u.email}`} />
                          {u.active ? "Active" : "Disabled"}
                        </label>
                        {confirmRemove === u.id ? (
                          <span className="flex items-center gap-2 text-xs">
                            <button type="button" onClick={() => handleRemove(u)} className="font-semibold text-red-500 hover:underline">
                              Yes, remove
                            </button>
                            <button type="button" onClick={() => setConfirmRemove(null)} className="text-[var(--muted)] hover:underline">
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(u.id)}
                            className="text-xs text-[var(--muted)] transition hover:text-red-500"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {isEditing && !u.is_super_admin && (
                  <div className="animate-fade-in border-t border-[var(--border)] bg-[var(--background)]/60 p-5">
                    <AccessPicker
                      tabKeys={tabKeys}
                      selected={new Set(u.allowed_tabs)}
                      onToggle={(tab) => toggleTab(u, tab)}
                      onApply={(keys) => applyPreset(u, keys)}
                    />
                    <p className="mt-4 text-xs text-[var(--muted)]">Changes save instantly.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
