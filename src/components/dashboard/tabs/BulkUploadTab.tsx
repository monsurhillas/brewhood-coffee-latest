"use client";

import { useEffect, useRef, useState } from "react";
import EmployeePicker, { EmployeeOption } from "@/components/dashboard/EmployeePicker";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import { formatMoney } from "@/lib/format";

type Sku = { id: number; name: string; price: string; active: boolean };

type PreviewSale = {
  key: string;
  sku_id: number | null;
  sku_name: string;
  quantity: number;
  unit_price: number;
};

type PreviewRow = {
  key: string;
  sl: number;
  raw_name: string;
  employee: EmployeeOption | null;
  low_confidence: boolean;
  match_confidence: number;
  included: boolean;
  sales: PreviewSale[];
  collection: { method: string; amount: string } | null;
};

type ExtractResponse = {
  date: string | null;
  rows: {
    sl: number;
    raw_name: string;
    matched_employee: { id: number; employee_id: string; name: string } | null;
    match_confidence: number;
    low_confidence: boolean;
    sales: { sku_id: number; sku_name: string; quantity: number; unit_price: number }[];
    collection: { method: string; amount: number } | null;
  }[];
  error?: string;
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `u${uidCounter}`;
}

export default function BulkUploadTab({ onSaved }: { onSaved: () => void }) {
  const [skus, setSkus] = useState<Sku[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/skus")
      .then((res) => res.json())
      .then((data) => setSkus((data.skus ?? []).filter((s: Sku) => s.active)));
  }, []);

  function updateRow(index: number, updater: (row: PreviewRow) => PreviewRow) {
    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? updater(r) : r)) : prev));
  }

  async function handleExtract() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF of the daily log first.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setExtracting(true);
    setRows(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/ocr/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_base64: base64 }),
      });
      const data: ExtractResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Extraction failed.");
        return;
      }
      if (data.date) setDate(data.date);
      setRows(
        data.rows.map((r) => ({
          key: uid(),
          sl: r.sl,
          raw_name: r.raw_name,
          employee: r.matched_employee
            ? { id: r.matched_employee.id, employee_id: r.matched_employee.employee_id, name: r.matched_employee.name, balance: 0 }
            : null,
          low_confidence: r.low_confidence,
          match_confidence: r.match_confidence,
          included: true,
          sales: r.sales.map((s) => ({ key: uid(), sku_id: s.sku_id, sku_name: s.sku_name, quantity: s.quantity, unit_price: s.unit_price })),
          collection: r.collection ? { method: r.collection.method, amount: String(r.collection.amount) } : null,
        }))
      );
      if (data.rows.length === 0) {
        setError("No filled-in rows were found on that sheet. Double-check the scan and try again.");
      }
    } catch {
      setError("Something went wrong reading that file. Try again.");
    } finally {
      setExtracting(false);
    }
  }

  function addSaleLine(rowIndex: number) {
    if (skus.length === 0) return;
    const first = skus[0];
    updateRow(rowIndex, (r) => ({
      ...r,
      sales: [
        ...r.sales,
        { key: uid(), sku_id: first.id, sku_name: first.name, quantity: 1, unit_price: Number(first.price) },
      ],
    }));
  }

  function removeSaleLine(rowIndex: number, saleKey: string) {
    updateRow(rowIndex, (r) => ({ ...r, sales: r.sales.filter((s) => s.key !== saleKey) }));
  }

  function changeSaleSku(rowIndex: number, saleKey: string, skuIdStr: string) {
    const sku = skus.find((s) => String(s.id) === skuIdStr);
    if (!sku) return;
    updateRow(rowIndex, (r) => ({
      ...r,
      sales: r.sales.map((s) => (s.key === saleKey ? { ...s, sku_id: sku.id, sku_name: sku.name, unit_price: Number(sku.price) } : s)),
    }));
  }

  function changeSaleQty(rowIndex: number, saleKey: string, qty: number) {
    updateRow(rowIndex, (r) => ({
      ...r,
      sales: r.sales.map((s) => (s.key === saleKey ? { ...s, quantity: qty } : s)),
    }));
  }

  function addManualRow() {
    setRows((prev) => {
      const list = prev ?? [];
      const nextSl = list.reduce((max, r) => Math.max(max, r.sl), 0) + 1;
      return [
        ...list,
        {
          key: uid(),
          sl: nextSl,
          raw_name: "",
          employee: null,
          low_confidence: false,
          match_confidence: 0,
          included: true,
          sales: [],
          collection: null,
        },
      ];
    });
  }

  function removeRow(rowIndex: number) {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== rowIndex) : prev));
  }

  function cancelUpload() {
    setRows(null);
    setFileName(null);
    setError(null);
    setSuccessMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleCollection(rowIndex: number) {
    updateRow(rowIndex, (r) => ({
      ...r,
      collection: r.collection ? null : { method: "cash", amount: "" },
    }));
  }

  function changeCollectionMethod(rowIndex: number, method: string) {
    updateRow(rowIndex, (r) => (r.collection ? { ...r, collection: { ...r.collection, method } } : r));
  }

  function changeCollectionAmount(rowIndex: number, amount: string) {
    updateRow(rowIndex, (r) => (r.collection ? { ...r, collection: { ...r.collection, amount } } : r));
  }

  const activeRows = (rows ?? []).filter((r) => r.included);
  const totalSales = activeRows.reduce((sum, r) => sum + r.sales.length, 0);
  const totalCollections = activeRows.filter((r) => r.collection && Number(r.collection.amount) > 0).length;

  async function handleConfirm() {
    if (!rows) return;
    setError(null);

    for (const r of activeRows) {
      const hasContent = r.sales.length > 0 || (r.collection && Number(r.collection.amount) > 0);
      if (hasContent && !r.employee) {
        setError(`Row SL ${r.sl} ("${r.raw_name}") needs an employee selected before uploading.`);
        return;
      }
    }

    const salesPayload = activeRows.flatMap((r) =>
      r.sales.map((s) => ({
        employee_id: r.employee!.id,
        sku_id: s.sku_id,
        sku_name: s.sku_name,
        quantity: s.quantity,
        unit_price: s.unit_price,
      }))
    );
    const collectionsPayload = activeRows
      .filter((r) => r.collection && Number(r.collection.amount) > 0)
      .map((r) => ({
        employee_id: r.employee!.id,
        amount: Number(r.collection!.amount),
        method: r.collection!.method,
      }));

    if (salesPayload.length === 0 && collectionsPayload.length === 0) {
      setError("Nothing to upload — every row was removed or left empty.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/ocr/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, sales: salesPayload, collections: collectionsPayload }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccessMessage(
        `Uploaded ${data.inserted.sales} sale${data.inserted.sales === 1 ? "" : "s"} and ${data.inserted.collections} collection${data.inserted.collections === 1 ? "" : "s"} for ${date}.`
      );
      setRows(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      onSaved();
    } else {
      setError(data.error ?? "Upload failed.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-medium">Bulk Upload from PDF</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload a photo/scan of a filled-in Daily Sales &amp; Collection Log sheet. It&apos;s read automatically, and
          you&apos;ll get an editable preview to check and correct before anything is saved.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="text-sm"
          />
          <button
            onClick={handleExtract}
            disabled={extracting || !fileName}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {extracting ? "Reading sheet…" : "Read Sheet"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {successMessage && <p className="mt-3 text-sm text-emerald-600">{successMessage}</p>}
      </div>

      {rows !== null && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Preview — check before uploading</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {totalSales} sale line{totalSales === 1 ? "" : "s"} · {totalCollections} collection
                {totalCollections === 1 ? "" : "s"} · {activeRows.length} of {rows.length} rows included
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Date for this sheet</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {rows.map((row, rowIndex) => (
              <div
                key={row.key}
                className={`rounded-lg border p-4 transition ${
                  row.included ? "border-[var(--border)]" : "border-[var(--border)] opacity-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 text-xs text-[var(--muted)]">SL {row.sl}</span>
                    <div className="min-w-[220px]">
                      <p className="mb-1 text-xs text-[var(--muted)]">
                        {row.raw_name ? (
                          <>Handwritten: &ldquo;{row.raw_name}&rdquo;</>
                        ) : (
                          <span className="italic">Manual entry</span>
                        )}
                        {row.low_confidence && (
                          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                            low-confidence match — verify
                          </span>
                        )}
                      </p>
                      <EmployeePicker
                        selected={row.employee}
                        onSelect={(emp) => updateRow(rowIndex, (r) => ({ ...r, employee: emp }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={() => updateRow(rowIndex, (r) => ({ ...r, included: !r.included }))}
                      />
                      Include this row
                    </label>
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove row
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-[var(--muted)]">Items sold</p>
                    <div className="flex flex-col gap-2">
                      {row.sales.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <ThemedSelect
                            className="flex-1"
                            value={String(s.sku_id ?? "")}
                            onChange={(v) => changeSaleSku(rowIndex, s.key, v)}
                            options={skus.map((sk) => ({ value: String(sk.id), label: `${sk.name} — ${formatMoney(Number(sk.price))}` }))}
                          />
                          <input
                            type="number"
                            min={1}
                            value={s.quantity}
                            onChange={(e) => changeSaleQty(rowIndex, s.key, Number(e.target.value))}
                            className="w-16 rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-[var(--brand)]"
                          />
                          <button
                            type="button"
                            onClick={() => removeSaleLine(rowIndex, s.key)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {row.sales.length === 0 && (
                        <p className="text-xs text-[var(--muted)]">No items ticked for this row.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => addSaleLine(rowIndex)}
                        className="self-start rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--brand)] hover:text-[var(--brand)]"
                      >
                        + Add item
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-[var(--muted)]">Collection</p>
                    <label className="mb-2 flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!row.collection} onChange={() => toggleCollection(rowIndex)} />
                      Collection happened on this row
                    </label>
                    {row.collection && (
                      <div className="flex items-center gap-2">
                        <ThemedSelect
                          className="w-32"
                          value={row.collection.method}
                          onChange={(v) => changeCollectionMethod(rowIndex, v)}
                          options={[
                            { value: "cash", label: "CASH" },
                            { value: "bkash", label: "BKASH" },
                            { value: "bank", label: "BANK" },
                          ]}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Amount"
                          value={row.collection.amount}
                          onChange={(e) => changeCollectionAmount(rowIndex, e.target.value)}
                          className="w-28 rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-[var(--brand)]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addManualRow}
            className="mt-4 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            + Add manual entry
          </button>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Uploading…" : `Confirm & Upload for ${date}`}
            </button>
            <button
              type="button"
              onClick={cancelUpload}
              disabled={submitting}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:border-red-400 hover:text-red-500 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
