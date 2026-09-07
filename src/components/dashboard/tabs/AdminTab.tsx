"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

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
  cost: "Manager Cost",
  bulk: "Bulk Upload",
  invoices: "Invoices",
  ledger: "Employee Ledger",
  analytics: "Analytics",
  reports: "Day-wise Reports",
  download: "Download Reports",
  skus: "SKUs",
};

export default function AdminTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [tabKeys, setTabKeys] = useState<TabKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newTabs, setNewTabs] = useState<Set<TabKey>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(d))))
      .then((data) => {
        setUsers(data.users);
        setTabKeys(data.tabKeys);
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
      setAddError("Pick at least one tab.");
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
      setNewEmail("");
      setNewName("");
      setNewTabs(new Set());
      load();
    } catch (err) {
      setAddError((err as { error?: string })?.error ?? "Failed to add user.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTab(user: AdminUser, tab: TabKey) {
    const next = new Set(user.allowed_tabs);
    if (next.has(tab)) next.delete(tab);
    else next.add(tab);
    if (next.size === 0) return; // must keep at least one
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedTabs: Array.from(next) }),
    });
    load();
  }

  async function toggleActive(user: AdminUser) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    load();
  }

  async function handleRemove(user: AdminUser) {
    await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-1 font-medium">Admin — Manage Access</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Add a Google account email below to let that person sign in with Google. Pick exactly
          which tabs they can see and use — nothing else is visible to them. You (the super admin)
          always have full access and can&apos;t be removed or restricted here.
        </p>

        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-[var(--border)] p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Email (Google account)
            <input
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="someone@example.com"
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Name (optional)
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Their name"
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>

          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium text-[var(--muted)]">Tabs they can access</p>
            <div className="flex flex-wrap gap-2">
              {tabKeys.map((tab) => (
                <label
                  key={tab}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    newTabs.has(tab)
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={newTabs.has(tab)}
                    onChange={() => {
                      const next = new Set(newTabs);
                      if (next.has(tab)) next.delete(tab);
                      else next.add(tab);
                      setNewTabs(next);
                    }}
                  />
                  {TAB_LABELS[tab] ?? tab}
                </label>
              ))}
            </div>
          </div>

          {addError && <p className="text-xs text-red-500 sm:col-span-2">{addError}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add User"}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {users && (
        <div className="scroll-fade-x overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Tabs</th>
                <th className="px-3 py-2">Last login</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)] last:border-0 align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{u.name || u.email}</p>
                    <p className="text-xs text-[var(--muted)]">{u.email}</p>
                    {u.is_super_admin && (
                      <span className="mt-1 inline-block rounded bg-[var(--brand)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand)]">
                        Super Admin
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.is_super_admin ? (
                      <span className="text-xs text-[var(--muted)]">All tabs</span>
                    ) : (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {tabKeys.map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => toggleTab(u, tab)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                              u.allowed_tabs.includes(tab)
                                ? "bg-[var(--brand)]/15 text-[var(--brand)]"
                                : "bg-black/5 text-[var(--muted)] hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                            }`}
                          >
                            {TAB_LABELS[tab] ?? tab}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">
                    {u.last_login_at ? formatDate(u.last_login_at) : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    {u.is_super_admin ? (
                      <span className="text-xs text-emerald-600">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className={`text-xs font-medium ${u.active ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {u.active ? "Active" : "Disabled"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!u.is_super_admin && (
                      <button
                        type="button"
                        onClick={() => handleRemove(u)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
