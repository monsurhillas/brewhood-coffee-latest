"use client";

import { useEffect, useState } from "react";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import EntryDateBar from "@/components/dashboard/EntryDateBar";
import { useEntryDate } from "@/lib/useEntryDate";
import { formatMoney, formatDate } from "@/lib/format";
import EntryEditControls from "@/components/dashboard/EntryEditControls";
import EditEntryDialog, { type EditTarget } from "@/components/dashboard/EditEntryDialog";
import type { EditRecord } from "@/lib/entryEdits";

type CostRow = {
  id: number;
  category: string;
  amount: number;
  note: string | null;
  payment_method: string | null;
  created_at: string;
  entry_date: string;
  editable: boolean;
  salary_linked: boolean;
  edits: EditRecord[];
};

const CATEGORIES = ["Beans", "Milk", "Salary", "Maintenance", "Others"];
const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "bank", label: "Bank" },
];

function methodLabel(m: string | null): string {
  return METHODS.find((x) => x.value === m)?.label ?? "—";
}

export default function ManagerCostTab({ onSaved }: { onSaved: () => void }) {
  const entryDate = useEntryDate();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormFeedback>(null);
  const [recent, setRecent] = useState<CostRow[]>([]);
  const [editing, setEditing] = useState<EditTarget | null>(null);

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
      body: JSON.stringify({
        category,
        amount: Number(amount),
        note,
        payment_method: method,
        entry_date: entryDate.date,
      }),
    });
    setSaving(false);

    if (res.ok) {
      setMessage({
        type: "success",
        text: entryDate.isBackdated ? `Cost recorded for ${entryDate.date}.` : "Cost recorded.",
      });
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
        <h2 className="font-medium">Log a cost</h2>

        <EntryDateBar entryDate={entryDate} />

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Category</label>
          <ThemedSelect
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Paid via</label>
          <ThemedSelect value={method} onChange={setMethod} options={METHODS} />
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
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-medium">Recent Costs</h2>
          <p className="text-xs text-[var(--muted)]">Entries from the last 30 days can be edited — remarks required, and every edit is kept in its history.</p>
        </div>
        {recent.length === 0 ? (
          <p className="bh-empty">No costs logged yet.</p>
        ) : (
          <>
            <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto sm:hidden">
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
                    <p>
                      {formatDate(r.created_at)} · {methodLabel(r.payment_method)}
                    </p>
                  </div>
                  {(r.editable || r.edits.length > 0 || r.salary_linked) && (
                    <div className="mt-2 flex justify-end">
                      <EntryEditControls
                        editable={r.editable && !r.salary_linked}
                        edits={r.edits}
                        note={r.salary_linked ? "Managed in Salary tab" : undefined}
                        onEdit={() => setEditing({ type: "cost", row: r })}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="scroll-fade-x hidden max-h-[70vh] overflow-auto sm:block">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th className="pb-2 pr-3">Category</th>
                    <th className="pb-2 pr-3">Note</th>
                    <th className="pb-2 pr-3">Paid via</th>
                    <th className="pb-2 pr-3 text-right">Amount</th>
                    <th className="pb-2 text-right">When</th>
                    <th className="pb-2 pl-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-3">{r.category}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{r.note ?? "—"}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{methodLabel(r.payment_method)}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(r.amount)}</td>
                      <td className="py-2 text-right text-xs text-[var(--muted)]">{formatDate(r.created_at)}</td>
                      <td className="py-2 pl-3 text-right">
                        <EntryEditControls
                          editable={r.editable && !r.salary_linked}
                          edits={r.edits}
                          note={r.salary_linked && r.editable ? "Managed in Salary tab" : undefined}
                          onEdit={() => setEditing({ type: "cost", row: r })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {editing && (
        <EditEntryDialog
          key={`${editing.type}-${editing.row.id}`}
          target={editing}
          categories={CATEGORIES}
          onClose={() => setEditing(null)}
          onSaved={() => {
            loadRecent();
            onSaved();
          }}
        />
      )}
    </div>
  );
}
