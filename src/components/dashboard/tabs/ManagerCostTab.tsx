"use client";

import { useEffect, useState } from "react";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import { formatMoney, formatDate } from "@/lib/format";

type CostRow = { id: number; category: string; amount: number; note: string | null; created_at: string };

const CATEGORIES = ["Beans", "Milk", "Salary", "Maintenance", "Others"];

export default function ManagerCostTab({ onSaved }: { onSaved: () => void }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormFeedback>(null);
  const [recent, setRecent] = useState<CostRow[]>([]);

  useEffect(() => {
    loadRecent();
  }, []);

  function loadRecent() {
    fetch("/api/costs")
      .then((res) => res.json())
      .then((data) => setRecent(data.costs ?? []));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) {
      setMessage({ type: "error", text: "Enter an amount." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, amount: Number(amount), note }),
    });
    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Cost recorded." });
      setAmount("");
      setNote("");
      loadRecent();
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "Failed to save." });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <h2 className="font-medium">Manager Cost</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Category</label>
          <ThemedSelect
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
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
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        <FormMessage message={message} />

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Record Cost"}
        </button>
      </form>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-medium">Recent Costs</h2>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No costs logged yet.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 sm:hidden">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{r.category}</p>
                    <p className="shrink-0 font-medium">{formatMoney(r.amount)}</p>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                    <p className="truncate">{r.note ?? "—"}</p>
                    <p>{formatDate(r.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="scroll-fade-x hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th className="pb-2">Category</th>
                    <th className="pb-2">Note</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2">{r.category}</td>
                      <td className="py-2 text-[var(--muted)]">{r.note ?? "—"}</td>
                      <td className="py-2 text-right">{formatMoney(r.amount)}</td>
                      <td className="py-2 text-right text-xs text-[var(--muted)]">{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
