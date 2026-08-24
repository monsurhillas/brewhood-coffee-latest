"use client";

import { useEffect, useState } from "react";
import EmployeePicker, { EmployeeOption } from "@/components/dashboard/EmployeePicker";
import { formatMoney, formatDay } from "@/lib/format";

type SaleRow = {
  id: number;
  sku_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type PreviewItem = {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  included: boolean;
};

type InvoiceListRow = {
  id: number;
  invoice_number: number;
  employee_name: string;
  employee_id: string;
  invoice_date: string;
  due_date: string;
  total: number;
  created_at: string;
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `inv${uidCounter}`;
}

export default function InvoiceTab() {
  const [customer, setCustomer] = useState<EmployeeOption | null>(null);
  const [date, setDate] = useState(todayISO());
  const [loadingSales, setLoadingSales] = useState(false);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ id: number; number: number } | null>(null);
  const [recent, setRecent] = useState<InvoiceListRow[]>([]);

  useEffect(() => {
    loadRecent();
  }, []);

  function loadRecent() {
    fetch("/api/invoices")
      .then((res) => res.json())
      .then((data) => setRecent(data.invoices ?? []));
  }

  async function handleLoadSales() {
    if (!customer) {
      setError("Pick a customer first.");
      return;
    }
    setError(null);
    setLastInvoice(null);
    setLoadingSales(true);
    setItems(null);
    try {
      const res = await fetch(`/api/invoices/sales?employee_id=${customer.id}&date=${date}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load sales.");
        return;
      }
      const sales: SaleRow[] = data.sales ?? [];
      setItems(
        sales.map((s) => ({
          key: uid(),
          description: s.sku_name,
          quantity: s.quantity,
          unitPrice: s.unit_price,
          included: true,
        }))
      );
      if (sales.length === 0) {
        setError(`No sales found for ${customer.name} on ${date}. You can still add items manually below.`);
        setItems([]);
      }
    } catch {
      setError("Something went wrong loading sales.");
    } finally {
      setLoadingSales(false);
    }
  }

  function updateItem(index: number, updater: (item: PreviewItem) => PreviewItem) {
    setItems((prev) => (prev ? prev.map((it, i) => (i === index ? updater(it) : it)) : prev));
  }

  function addCustomItem() {
    setItems((prev) => [
      ...(prev ?? []),
      { key: uid(), description: "", quantity: 1, unitPrice: 0, included: true },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.key !== key) : prev));
  }

  const includedItems = (items ?? []).filter((it) => it.included);
  const subtotal = includedItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  async function handleGenerate() {
    if (!customer) {
      setError("Pick a customer first.");
      return;
    }
    const payloadItems = includedItems
      .filter((it) => it.description.trim() && it.quantity > 0)
      .map((it) => ({
        description: it.description.trim(),
        quantity: it.quantity,
        total: Math.round(it.quantity * it.unitPrice * 100) / 100,
      }));
    if (payloadItems.length === 0) {
      setError("Include at least one item with a description and quantity before generating.");
      return;
    }
    setError(null);
    setGenerating(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: customer.id, invoice_date: date, items: payloadItems }),
    });
    setGenerating(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLastInvoice({ id: data.invoice.id, number: data.invoice.invoice_number });
      window.open(`/api/invoices/${data.invoice.id}/pdf`, "_blank");
      loadRecent();
    } else {
      setError(data.error ?? "Failed to generate invoice.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-medium">Generate Invoice</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick a customer and a day to pull in their sales, then adjust the items below before generating the PDF.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Customer</label>
            <EmployeePicker selected={customer} onSelect={setCustomer} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleLoadSales}
              disabled={loadingSales}
              className="w-full rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
            >
              {loadingSales ? "Loading…" : "Load Sales"}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {lastInvoice && (
          <p className="mt-3 text-sm text-emerald-600">
            Invoice #{String(lastInvoice.number).padStart(4, "0")} generated.{" "}
            <a
              href={`/api/invoices/${lastInvoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open PDF
            </a>
          </p>
        )}
      </div>

      {items && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Items on this invoice</h2>
            <p className="text-xs text-[var(--muted)]">
              Invoice date: {formatDay(date)} · Due date: {formatDay(todayISO())}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                  <th className="w-10 pb-2"></th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="w-16 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.key} className={`border-b border-[var(--border)] last:border-0 ${item.included ? "" : "opacity-40"}`}>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={() => updateItem(i, (it) => ({ ...it, included: !it.included }))}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(i, (it) => ({ ...it, description: e.target.value }))}
                        placeholder="Item description"
                        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--brand)]"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={(e) => updateItem(i, (it) => ({ ...it, quantity: Number(e.target.value) }))}
                        className="w-16 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--brand)]"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(i, (it) => ({ ...it, unitPrice: Number(e.target.value) }))}
                        className="w-24 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--brand)]"
                      />
                    </td>
                    <td className="py-2 text-right font-medium">{formatMoney(item.quantity * item.unitPrice)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--muted)]">No items yet — add one below.</p>
            )}
          </div>

          <button
            type="button"
            onClick={addCustomItem}
            className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            + Add item
          </button>

          <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-sm">
              Subtotal (<span className="font-medium">{includedItems.length}</span> item
              {includedItems.length === 1 ? "" : "s"} included): <span className="font-semibold">{formatMoney(subtotal)}</span>
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || !customer}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate Invoice PDF"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-medium">Recent Invoices</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="pb-2">Invoice #</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Invoice Date</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2">{String(inv.invoice_number).padStart(4, "0")}</td>
                  <td className="py-2">
                    {inv.employee_name} <span className="text-xs text-[var(--muted)]">#{inv.employee_id}</span>
                  </td>
                  <td className="py-2 text-xs text-[var(--muted)]">{formatDay(inv.invoice_date)}</td>
                  <td className="py-2 text-right">{formatMoney(inv.total)}</td>
                  <td className="py-2 text-right">
                    <a
                      href={`/api/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--brand)] hover:underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">No invoices generated yet.</p>}
        </div>
      </div>
    </div>
  );
}
