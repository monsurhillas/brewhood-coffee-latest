"use client";

import { useEffect, useState } from "react";
import EmployeePicker, { EmployeeOption } from "@/components/dashboard/EmployeePicker";
import { formatMoney, formatDate } from "@/lib/format";

type CollectionRow = {
  id: number;
  employee_name: string;
  employee_id: string;
  amount: number;
  method: string;
  is_contra: boolean;
  note: string | null;
  created_at: string;
};

const METHODS = ["cash", "bkash", "bank"];

export default function CollectionEntryTab({ onSaved }: { onSaved: () => void }) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [isContra, setIsContra] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<CollectionRow[]>([]);

  useEffect(() => {
    loadRecent();
  }, []);

  function loadRecent() {
    fetch("/api/collections")
      .then((res) => res.json())
      .then((data) => setRecent(data.collections ?? []));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee || !amount) {
      setMessage("Pick an employee and enter an amount.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employee.id,
        amount: Number(amount),
        method,
        is_contra: isContra,
        note,
      }),
    });
    setSaving(false);

    if (res.ok) {
      setMessage(isContra ? "Contra entry recorded." : "Collection recorded.");
      setAmount("");
      setNote("");
      setIsContra(false);
      loadRecent();
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to save.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <h2 className="font-medium">{isContra ? "Contra Entry" : "Collection Entry"}</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Employee</label>
          <EmployeePicker selected={employee} onSelect={setEmployee} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Amount</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isContra} onChange={(e) => setIsContra(e.target.checked)} />
          This is a Contra Entry (correction / reversal)
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        {message && <p className="text-sm text-[var(--brand)]">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : isContra ? "Record Contra Entry" : "Record Collection"}
        </button>
      </form>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent Collections</h2>
          <p className="text-xs text-[var(--muted)]">
            Entries are permanent — use a contra entry to correct a mistake.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Employee</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Method</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2">{r.employee_name}</td>
                  <td className="py-2">{r.is_contra ? "Contra" : "Collection"}</td>
                  <td className="py-2 uppercase text-xs">{r.method}</td>
                  <td className="py-2 text-right">{formatMoney(r.amount)}</td>
                  <td className="py-2 text-right text-xs text-[var(--muted)]">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No collections yet.</p>}
        </div>
      </div>
    </div>
  );
}
