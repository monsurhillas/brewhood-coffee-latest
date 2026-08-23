"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

type Sku = { id: number; name: string; category: string | null; price: string; active: boolean };

export default function SkusTab() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
                  <td className="py-2 text-right">{formatMoney(Number(s.price))}</td>
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
    </div>
  );
}
