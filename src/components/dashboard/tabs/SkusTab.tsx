"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

type Sku = { id: number; name: string; category: string | null; price: string; active: boolean };

type BackfillResult = {
  updated: number;
  unresolvedPricing: { id: number; sku_name: string; total: number; price: number; employee_name: string }[];
  unresolvedNoSku: { id: number; sku_name: string; total: number; employee_name: string }[];
};

export default function SkusTab() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    fetch("/api/skus")
      .then((res) => res.json())
      .then((data) => setSkus(data.skus ?? []));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !price) {
      setMessage("Name and price are required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/skus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category: category || null, price: Number(price) }),
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      setCategory("");
      setPrice("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to add item.");
    }
  }

  async function toggleActive(sku: Sku) {
    await fetch(`/api/skus/${sku.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sku.active }),
    });
    load();
  }

  function startEditPrice(sku: Sku) {
    setEditingId(sku.id);
    setEditPrice(String(Number(sku.price)));
    setPriceError(null);
  }

  function cancelEditPrice() {
    setEditingId(null);
    setEditPrice("");
    setPriceError(null);
  }

  async function saveEditPrice(sku: Sku) {
    const value = Number(editPrice);
    if (!editPrice || Number.isNaN(value) || value < 0) {
      setPriceError("Enter a valid price.");
      return;
    }
    setPriceSaving(true);
    setPriceError(null);
    const res = await fetch(`/api/skus/${sku.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: value }),
    });
    setPriceSaving(false);
    if (res.ok) {
      setEditingId(null);
      setEditPrice("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setPriceError(data.error ?? "Failed to update price.");
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    const res = await fetch("/api/admin/backfill-sale-quantities", { method: "POST" });
    setBackfilling(false);
    if (res.ok) {
      setBackfillResult(await res.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setBackfillError(data.error ?? "Failed to run the fix.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <h2 className="font-medium">Add Item</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Category (optional)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Price</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        {message && <p className="text-sm text-red-500">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add Item"}
        </button>
      </form>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-medium">Menu / SKUs</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">Click a price to edit it.</p>
        {priceError && <p className="mb-3 text-sm text-red-500">{priceError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-[var(--muted)]">{s.category ?? "—"}</td>
                  <td className="py-2 text-right">
                    {editingId === s.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          autoFocus
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditPrice(s);
                            if (e.key === "Escape") cancelEditPrice();
                          }}
                          className="w-24 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-[var(--brand)]"
                        />
                        <button
                          onClick={() => saveEditPrice(s)}
                          disabled={priceSaving}
                          className="rounded px-1.5 py-1 text-xs font-medium text-emerald-600 hover:underline disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditPrice}
                          disabled={priceSaving}
                          className="rounded px-1.5 py-1 text-xs text-[var(--muted)] hover:underline disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditPrice(s)}
                        title="Edit price"
                        className="rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {formatMoney(Number(s.price))} <span aria-hidden className="ml-1 text-xs text-[var(--muted)]">✎</span>
                      </button>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {skus.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No items yet.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
        <h2 className="font-medium">Fix legacy sale quantities</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The old system only exported a total per sale, not a quantity, so imported rows like a ৳450 Cappuccino
          line show as &ldquo;Cappuccino × 1&rdquo; instead of &ldquo;× 3&rdquo;. This backs out the real quantity
          and per-item price wherever the total divides evenly by the item&apos;s current price. It only touches
          rows imported from the legacy system — nothing entered through Sale Entry or Bulk Upload is affected.
        </p>
        <button
          onClick={runBackfill}
          disabled={backfilling}
          className="mt-3 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {backfilling ? "Fixing…" : "Fix legacy sale quantities"}
        </button>

        {backfillError && <p className="mt-3 text-sm text-red-500">{backfillError}</p>}

        {backfillResult && (
          <div className="mt-4 text-sm">
            <p className="font-medium text-emerald-600">
              Fixed {backfillResult.updated} sale{backfillResult.updated === 1 ? "" : "s"}.
            </p>

            {backfillResult.unresolvedPricing.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Couldn&apos;t auto-fix — total doesn&apos;t divide evenly by the item&apos;s current price
                </p>
                <ul className="mt-1 divide-y divide-[var(--border)]">
                  {backfillResult.unresolvedPricing.map((r) => (
                    <li key={r.id} className="py-1.5 text-xs text-[var(--muted)]">
                      {r.employee_name} — {r.sku_name} — total {formatMoney(r.total)} vs current price{" "}
                      {formatMoney(r.price)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {backfillResult.unresolvedNoSku.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Couldn&apos;t auto-fix — item name didn&apos;t match a SKU on import
                </p>
                <ul className="mt-1 divide-y divide-[var(--border)]">
                  {backfillResult.unresolvedNoSku.map((r) => (
                    <li key={r.id} className="py-1.5 text-xs text-[var(--muted)]">
                      {r.employee_name} — {r.sku_name} — total {formatMoney(r.total)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
