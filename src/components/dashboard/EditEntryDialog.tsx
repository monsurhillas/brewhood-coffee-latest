"use client";

import { useEffect, useState } from "react";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import { ChangeLine } from "@/components/dashboard/EntryEditControls";
import { formatMoney } from "@/lib/format";
import { todayInDhaka } from "@/lib/entryDate";
import type { EditChange } from "@/lib/entryEdits";

export type EditableSale = {
  id: number;
  employee_name: string;
  sku_id: number | null;
  sku_name: string;
  quantity: number;
  unit_price: number;
  entry_date: string;
};
export type EditableCollection = {
  id: number;
  employee_name: string;
  amount: number;
  method: string;
  is_contra: boolean;
  trx_id: string | null;
  entry_date: string;
};
export type EditableCost = {
  id: number;
  category: string;
  amount: number;
  note: string | null;
  payment_method: string | null;
  entry_date: string;
};
export type EditTarget =
  | { type: "sale"; row: EditableSale }
  | { type: "collection"; row: EditableCollection }
  | { type: "cost"; row: EditableCost };

type SkuOpt = { id: number; name: string; price: string };

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "bank", label: "Bank" },
];
const mLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]";

type F = {
  date: string;
  item: string; // "keep" or a sku id
  qty: string;
  price: string;
  amount: string;
  method: string;
  trx: string;
  category: string;
  note: string;
};

function initial(t: EditTarget): F {
  const blank: F = { date: t.row.entry_date, item: "keep", qty: "", price: "", amount: "", method: "cash", trx: "", category: "", note: "" };
  if (t.type === "sale") return { ...blank, qty: String(t.row.quantity), price: String(t.row.unit_price) };
  if (t.type === "collection") return { ...blank, amount: String(t.row.amount), method: t.row.method, trx: t.row.trx_id ?? "" };
  return { ...blank, amount: String(t.row.amount), method: t.row.payment_method ?? "cash", category: t.row.category, note: t.row.note ?? "" };
}

const num = (s: string) => Number(s);
const differs = (a: number, b: number) => Math.abs(a - b) >= 0.005;

// What the user changed: the `changes` body for the API and a from -> to list
// for the confirmation step.
function computeDiff(t: EditTarget, f: F, skus: SkuOpt[]): { changes: Record<string, unknown>; diff: EditChange[] } {
  const changes: Record<string, unknown> = {};
  const diff: EditChange[] = [];
  const d = t.row.entry_date;
  if (f.date !== d) {
    changes.date = f.date;
    diff.push({ field: "date", label: "Date", kind: "date", from: d, to: f.date });
  }
  if (t.type === "sale") {
    const r = t.row;
    const sku = f.item !== "keep" ? skus.find((s) => String(s.id) === f.item) : undefined;
    if (sku && sku.name !== r.sku_name) {
      changes.sku_id = sku.id;
      changes.sku_name = sku.name;
      diff.push({ field: "item", label: "Item", kind: "text", from: r.sku_name, to: sku.name });
    }
    if (num(f.qty) !== r.quantity) {
      changes.quantity = num(f.qty);
      diff.push({ field: "quantity", label: "Quantity", kind: "number", from: r.quantity, to: num(f.qty) });
    }
    if (differs(num(f.price), r.unit_price)) {
      changes.unit_price = num(f.price);
      diff.push({ field: "unit_price", label: "Unit price", kind: "money", from: r.unit_price, to: num(f.price) });
    }
    const oldTotal = Math.round(r.unit_price * r.quantity * 100) / 100;
    const newTotal = Math.round(num(f.price) * num(f.qty) * 100) / 100;
    if (differs(oldTotal, newTotal) && Number.isFinite(newTotal)) diff.push({ field: "total", label: "Total", kind: "money", from: oldTotal, to: newTotal });
  } else if (t.type === "collection") {
    const r = t.row;
    if (differs(num(f.amount), r.amount)) {
      changes.amount = num(f.amount);
      diff.push({ field: "amount", label: "Amount", kind: "money", from: r.amount, to: num(f.amount) });
    }
    if (f.method !== r.method) {
      changes.method = f.method;
      diff.push({ field: "method", label: "Method", kind: "text", from: mLabel(r.method), to: mLabel(f.method) });
    }
    const trxNew = f.method === "cash" ? "" : f.trx.trim();
    if (trxNew !== (r.trx_id ?? "")) {
      changes.trx_id = trxNew || null;
      diff.push({ field: "trx_id", label: "Trx ID", kind: "text", from: r.trx_id, to: trxNew || null });
    }
  } else {
    const r = t.row;
    if (f.category !== r.category) {
      changes.category = f.category;
      diff.push({ field: "category", label: "Category", kind: "text", from: r.category, to: f.category });
    }
    if (differs(num(f.amount), r.amount)) {
      changes.amount = num(f.amount);
      diff.push({ field: "amount", label: "Amount", kind: "money", from: r.amount, to: num(f.amount) });
    }
    if (f.method !== (r.payment_method ?? "cash")) {
      changes.payment_method = f.method;
      diff.push({ field: "payment_method", label: "Paid via", kind: "text", from: mLabel(r.payment_method ?? "cash"), to: mLabel(f.method) });
    }
    if (f.note.trim() !== (r.note ?? "")) {
      changes.note = f.note.trim();
      diff.push({ field: "note", label: "Note", kind: "text", from: r.note, to: f.note.trim() || null });
    }
  }
  return { changes, diff };
}

// Edit one sale / collection / cost. Step 1: change the fields and write the
// (mandatory) remarks. Step 2: one "are you sure?" confirmation that shows
// old -> new, then it is saved and logged to the entry's edit history.
export default function EditEntryDialog({
  target,
  skus = [],
  categories = [],
  onClose,
  onSaved,
}: {
  target: EditTarget;
  skus?: SkuOpt[];
  categories?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<F>(() => initial(target));
  const [remarks, setRemarks] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormFeedback>(null);
  const set = (patch: Partial<F>) => setF((p) => ({ ...p, ...patch }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const { changes, diff } = computeDiff(target, f, skus);
  const remarksOk = remarks.trim().length >= 3;

  function validate(): string | null {
    if (!f.date) return "Choose a date.";
    if (f.date > todayInDhaka()) return "Date can't be in the future.";
    if (target.type === "sale") {
      if (!Number.isInteger(num(f.qty)) || num(f.qty) <= 0) return "Quantity must be a whole number above 0.";
      if (!f.price || !Number.isFinite(num(f.price)) || num(f.price) < 0) return "Enter a valid unit price.";
    } else if (!f.amount || !Number.isFinite(num(f.amount)) || num(f.amount) <= 0) {
      return "Enter an amount above 0.";
    }
    return null;
  }

  function review() {
    const err = validate();
    if (err) return setMessage({ type: "error", text: err });
    if (diff.length === 0) return setMessage({ type: "error", text: "You haven't changed anything yet." });
    if (!remarksOk) return setMessage({ type: "error", text: "Remarks are required — write why you are editing this entry." });
    setMessage(null);
    setStep("confirm");
  }

  async function confirm() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/entry-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: target.type, id: target.row.id, remarks: remarks.trim(), changes }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setStep("form");
      setMessage({ type: "error", text: data.error ?? "Failed to save the edit." });
    }
  }

  const title = target.type === "sale" ? "Edit sale" : target.type === "collection" ? (target.row.is_contra ? "Edit contra entry" : "Edit collection") : "Edit cost";
  const summary =
    target.type === "sale"
      ? `${target.row.employee_name} · ${target.row.sku_name} × ${target.row.quantity}`
      : target.type === "collection"
        ? `${target.row.employee_name} · ${formatMoney(target.row.amount)} ${mLabel(target.row.method)}`
        : `${target.row.category} · ${formatMoney(target.row.amount)}`;

  const catOptions = [...new Set([...categories, ...(target.type === "cost" ? [target.row.category] : [])])];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
        {step === "form" ? (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-xs text-[var(--muted)]">{summary}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Date</label>
              <input type="date" value={f.date} max={todayInDhaka()} onChange={(e) => set({ date: e.target.value })} className={inputCls} />
            </div>

            {target.type === "sale" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Item</label>
                  <ThemedSelect
                    value={f.item}
                    onChange={(v) => {
                      const sku = skus.find((s) => String(s.id) === v);
                      set({ item: v, ...(sku ? { price: sku.price } : { price: String(target.row.unit_price) }) });
                    }}
                    options={[
                      { value: "keep", label: `${target.row.sku_name} (current)` },
                      ...skus.map((s) => ({ value: String(s.id), label: `${s.name} — ${formatMoney(Number(s.price))}` })),
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Quantity</label>
                    <input type="number" min={1} step={1} value={f.qty} onChange={(e) => set({ qty: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Unit price</label>
                    <input type="number" min={0} step="0.01" value={f.price} onChange={(e) => set({ price: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  New total: <span className="font-medium text-[var(--foreground)]">{formatMoney((num(f.qty) || 0) * (num(f.price) || 0))}</span>
                </p>
              </>
            )}

            {target.type === "collection" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Amount</label>
                    <input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Method</label>
                    <ThemedSelect value={f.method} onChange={(v) => set({ method: v })} options={METHODS} />
                  </div>
                </div>
                {f.method !== "cash" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Trx ID (optional)</label>
                    <input value={f.trx} onChange={(e) => set({ trx: e.target.value })} className={inputCls} />
                  </div>
                )}
              </>
            )}

            {target.type === "cost" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Category</label>
                    <ThemedSelect value={f.category} onChange={(v) => set({ category: v })} options={catOptions.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Paid via</label>
                    <ThemedSelect value={f.method} onChange={(v) => set({ method: v })} options={METHODS} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Amount</label>
                  <input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Note</label>
                  <input value={f.note} onChange={(e) => set({ note: e.target.value })} className={inputCls} />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Remarks <span className="text-red-500">*</span> <span className="font-normal">— why are you editing this?</span>
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Entered 2 cups instead of 3 / wrong date"
                className={`${inputCls} resize-none`}
              />
            </div>

            <FormMessage message={message} />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">
                Cancel
              </button>
              <button
                type="button"
                onClick={review}
                disabled={diff.length === 0 || !remarksOk}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">Are you sure you want to edit this entry?</h2>
              <p className="text-xs text-[var(--muted)]">{summary}</p>
            </div>
            <ul className="flex flex-col gap-1 rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
              {diff.map((c) => (
                <ChangeLine key={c.field} c={c} />
              ))}
            </ul>
            <p className="text-sm">
              <span className="text-[var(--muted)]">Remarks: </span>
              {remarks.trim()}
            </p>
            <p className="text-xs text-[var(--muted)]">This updates the entry everywhere (balances, reports, exports) and is saved in its edit history.</p>
            <FormMessage message={message} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep("form")} disabled={saving} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5">
                Go back
              </button>
              <button type="button" onClick={confirm} disabled={saving} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                {saving ? "Saving…" : "Yes, edit entry"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
