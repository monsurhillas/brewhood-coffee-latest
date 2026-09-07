"use client";

import { useEffect, useState } from "react";
import EmployeePicker, { EmployeeOption } from "@/components/dashboard/EmployeePicker";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import { formatMoney, formatDate } from "@/lib/format";

type Sku = { id: number; name: string; price: string; active: boolean };
type SaleRow = {
  id: number;
  employee_name: string;
  employee_id: string;
  sku_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  created_at: string;
};

export default function SaleEntryTab({ onSaved }: { onSaved: () => void }) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [skuId, setSkuId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormFeedback>(null);
  const [recent, setRecent] = useState<SaleRow[]>([]);

  useEffect(() => {
    fetch("/api/skus")
      .then((res) => res.json())
      .then((data) => setSkus((data.skus ?? []).filter((s: Sku) => s.active)));
    loadRecent();
  }, []);

  function loadRecent() {
    fetch("/api/sales")
      .then((res) => res.json())
      .then((data) => setRecent(data.sales ?? []));
  }

  function handleSkuChange(id: string) {
    setSkuId(id);
    const sku = skus.find((s) => String(s.id) === id);
    if (sku) setUnitPrice(sku.price);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) {
      setMessage({ type: "error", text: "Pick an employee first." });
      return;
    }
    const sku = skus.find((s) => String(s.id) === skuId);
    if (!sku && !unitPrice) {
      setMessage({ type: "error", text: "Pick an item or enter a unit price." });
      return;
    }

    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employee.id,
        sku_id: sku?.id ?? null,
        sku_name: sku?.name ?? "Custom item",
        quantity: Number(quantity),
        unit_price: Number(unitPrice),
        note,
      }),
    });
    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Sale recorded." });
      setEmployee(null);
      setSkuId("");
      setUnitPrice("");
      setQuantity("1");
      setNote("");
      loadRecent();
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "Failed to record sale." });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <h2 className="font-medium">Sale Entry</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Employee</label>
          <EmployeePicker selected={employee} onSelect={setEmployee} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Item</label>
          <ThemedSelect
            value={skuId}
            onChange={handleSkuChange}
            placeholder="Custom item…"
            options={[
              { value: "", label: "Custom item…" },
              ...skus.map((s) => ({
                value: String(s.id),
                label: `${s.name} — ${formatMoney(Number(s.price))}`,
              })),
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Unit Price</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Total</label>
          <div className="w-full rounded-lg border border-[var(--border)] bg-black/5 px-3 py-2 text-sm font-medium dark:bg-white/5">
            {formatMoney((Number(quantity) || 0) * (Number(unitPrice) || 0))}
          </div>
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
          {saving ? "Saving…" : "Record Sale"}
        </button>
      </form>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-medium">Recent Sales</h2>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No sales yet.</p>
        ) : (
          <>
            {/* Below sm, a table this wide has to scroll to be read at all —
                on a phone that reads as "the box is cut off". A stacked card
                per row needs no horizontal scroll, so it replaces the table
                entirely on narrow screens; the table returns at sm and up. */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{r.sku_name}</p>
                    <p className="shrink-0 font-medium">{formatMoney(r.total)}</p>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                    <p className="truncate">
                      {r.employee_name} · Qty {r.quantity}
                    </p>
                    <p>{formatDate(r.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="scroll-fade-x hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th className="pb-2">Employee</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2">{r.employee_name}</td>
                      <td className="py-2">{r.sku_name}</td>
                      <td className="py-2">{r.quantity}</td>
                      <td className="py-2 text-right">{formatMoney(r.total)}</td>
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
