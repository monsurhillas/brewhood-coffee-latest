"use client";

import { useEffect, useRef, useState } from "react";
import ThemedSelect from "@/components/dashboard/ThemedSelect";
import FormMessage, { FormFeedback } from "@/components/dashboard/FormMessage";
import EntryDateBar from "@/components/dashboard/EntryDateBar";
import { useEntryDate } from "@/lib/useEntryDate";
import { formatMoney, formatDate, formatDay } from "@/lib/format";

// Temporary Sales — dues for people who have no employee/customer profile.
// Type a name, book the sale, and the amount shows up in Total Outstanding;
// collect it later from this same tab. No profile is ever created.

type Customer = {
  key: string;
  name: string;
  due: number;
  sales_total: number;
  paid_total: number;
  adjusted_total: number;
  entry_count: number;
  last_activity: string;
};
type LedgerRow = {
  id: number;
  kind: "sale" | "payment" | "adjustment";
  created_at: string;
  sku_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  method: string | null;
  trx_id: string | null;
  note: string | null;
  balance_after: number;
};
type Sku = { id: number; name: string; price: string; active: boolean };
type Mode = "sale" | "payment" | "adjustment";
type Filter = "open" | "settled" | "all";

const METHODS = ["cash", "bkash", "bank"];
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "sale", label: "New Sale", hint: "Book a sale on credit — it becomes a due." },
  { key: "payment", label: "Collect Due", hint: "Record money received against an open due." },
  { key: "adjustment", label: "Waive / Correct", hint: "Reduce a due without money changing hands (wrong item, goodwill). A reason is required." },
];

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export default function TempSalesTab({ onSaved }: { onSaved: () => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [skus, setSkus] = useState<Sku[]>([]);
  const entryDate = useEntryDate();

  const [mode, setMode] = useState<Mode>("sale");
  const [name, setName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormFeedback>(null);
  const [clashHit, setClashHit] = useState<{ key: string; name: string } | null>(null);

  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<{ key: string; rows: LedgerRow[] } | null>(null);
  const [historyToken, setHistoryToken] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/temp-sales")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => setCustomers([]));
  }
  useEffect(() => {
    load();
    fetch("/api/skus")
      .then((r) => r.json())
      .then((d) => setSkus((d.skus ?? []).filter((s: Sku) => s.active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    fetch(`/api/temp-sales/customer?key=${encodeURIComponent(expanded)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setHistory({ key: expanded, rows: d.rows });
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, historyToken]);

  useEffect(() => {
    if (!pickerOpen) return;
    function down(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [pickerOpen]);

  const all = customers ?? [];
  const typedKey = norm(name);
  const match = typedKey ? all.find((c) => c.key === typedKey) : undefined;

  // Warn when the typed name is already a real profile — the due should live
  // on that profile (Sale Entry), not as a temporary one.
  useEffect(() => {
    if (mode !== "sale" || typedKey.length < 3 || match) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/employees?q=${encodeURIComponent(name.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          const hit = (d.employees ?? []).find((e: { name: string }) => norm(e.name) === typedKey);
          if (!cancelled && hit) setClashHit({ key: typedKey, name: hit.name });
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, mode, typedKey, match]);

  // Only counts while the field still holds the name that matched.
  const profileClash = mode === "sale" && !match && clashHit && clashHit.key === typedKey ? clashHit.name : null;

  const suggestions = (mode === "sale" ? all : all.filter((c) => c.due > 0))
    .filter((c) => !typedKey || c.key.includes(typedKey))
    .slice(0, 8);

  const totalDue = all.reduce((s, c) => s + (c.due > 0 ? c.due : 0), 0);
  const openCount = all.filter((c) => c.due > 0).length;

  const visible = all.filter((c) => {
    if (filter === "open" && !(c.due > 0)) return false;
    if (filter === "settled" && c.due > 0) return false;
    return !search.trim() || c.key.includes(norm(search));
  });

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setAmount("");
    setTrxId("");
    setNote("");
    // A name that isn't an open due can't be collected from — drop it.
    if (next !== "sale") {
      const c = all.find((x) => x.key === norm(name));
      if (!c || c.due <= 0) setName("");
    }
  }

  function startFor(c: Customer, next: Mode) {
    setMode(next);
    setName(c.name);
    setAmount(next === "sale" ? "" : String(c.due));
    setTrxId("");
    setNote("");
    setMessage(null);
    setPickerOpen(false);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleSkuChange(id: string) {
    setSkuId(id);
    const sku = skus.find((s) => String(s.id) === id);
    if (sku) setUnitPrice(sku.price);
  }

  const due = match?.due ?? 0;
  const saleTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: "error", text: mode === "sale" ? "Enter the customer's name." : "Pick a customer with an open due." });
      return;
    }
    const payload: Record<string, unknown> = {
      type: mode,
      customer_name: name,
      note,
      entry_date: entryDate.date,
    };
    if (mode === "sale") {
      const sku = skus.find((s) => String(s.id) === skuId);
      if (!sku && !unitPrice) {
        setMessage({ type: "error", text: "Pick an item or enter a unit price." });
        return;
      }
      payload.sku_id = sku?.id ?? null;
      payload.sku_name = sku?.name ?? "Custom item";
      payload.quantity = Number(quantity);
      payload.unit_price = Number(unitPrice);
    } else {
      if (!match || match.due <= 0) {
        setMessage({ type: "error", text: "That name has no open due. Pick a customer from the list." });
        return;
      }
      payload.amount = Number(amount);
      if (mode === "payment") {
        payload.method = method;
        payload.trx_id = method === "cash" ? "" : trxId;
      }
    }

    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/temp-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Failed to save." });
      return;
    }

    const who = data.entry?.customer_name ?? name.trim();
    const on = entryDate.isBackdated ? ` for ${entryDate.date}` : "";
    const text =
      mode === "sale"
        ? `Sale of ${formatMoney(saleTotal)} booked to ${who}${on}.`
        : mode === "payment"
          ? `${formatMoney(Number(amount))} collected from ${who}${on}.`
          : `${formatMoney(Number(amount))} adjusted off ${who}'s due${on}.`;
    setMessage({ type: "success", text });
    setName("");
    setSkuId("");
    setQuantity("1");
    setUnitPrice("");
    setAmount("");
    setTrxId("");
    setNote("");
    load();
    setHistoryToken((v) => v + 1);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Temporary dues</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">{formatMoney(totalDue)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Customers owing</p>
          <p className="text-lg font-semibold">{openCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex h-fit flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <div>
            <h2 className="font-medium">Temporary Sale</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              For people without a profile. Their due counts in Total Outstanding; no profile is created.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 text-xs font-medium">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMode(m.key)}
                className={`rounded-md px-2 py-1.5 transition-colors ${
                  mode === m.key ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-xs text-[var(--muted)]">{MODES.find((m) => m.key === mode)?.hint}</p>

          <EntryDateBar entryDate={entryDate} />

          <div className="relative" ref={pickerRef}>
            <label className={labelCls}>Customer name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              maxLength={80}
              autoComplete="off"
              placeholder={mode === "sale" ? "Type a name — existing or new" : "Search customers with a due"}
              className={inputCls}
            />
            {pickerOpen && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
                {suggestions.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setName(c.name);
                        setPickerOpen(false);
                        if (mode === "payment") setAmount(String(c.due));
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className={`shrink-0 text-xs ${c.due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--muted)]"}`}>
                        {c.due > 0 ? `due ${formatMoney(c.due)}` : "settled"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {typedKey && !profileClash && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {match
                  ? `Existing temporary customer · ${match.due > 0 ? `owes ${formatMoney(match.due)}` : "no due right now"}`
                  : mode === "sale"
                    ? "New temporary customer — no profile will be created."
                    : "No open due under this name."}
              </p>
            )}
            {profileClash && (
              <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
                A profile named “{profileClash}” already exists. Use Sale Entry so the due stays on that profile.
              </p>
            )}
          </div>

          {mode === "sale" && (
            <>
              <div>
                <label className={labelCls}>Item</label>
                <ThemedSelect
                  value={skuId}
                  onChange={handleSkuChange}
                  placeholder="Custom item…"
                  options={[
                    { value: "", label: "Custom item…" },
                    ...skus.map((s) => ({ value: String(s.id), label: `${s.name} — ${formatMoney(Number(s.price))}` })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Quantity</label>
                  <input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unit Price</label>
                  <input type="number" step="0.01" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Total (added to due)</label>
                <div className="w-full rounded-lg border border-[var(--border)] bg-black/5 px-3 py-2 text-sm font-medium dark:bg-white/5">
                  {formatMoney(saleTotal)}
                </div>
              </div>
            </>
          )}

          {mode !== "sale" && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--muted)]">Amount</label>
                  {match && match.due > 0 && (
                    <button type="button" onClick={() => setAmount(String(match.due))} className="text-xs font-medium text-[var(--brand)] hover:underline">
                      Full due ({formatMoney(match.due)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={match && match.due > 0 ? match.due : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
                {match && match.due > 0 && Number(amount) > 0 && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {Number(amount) > due
                      ? `More than the ${formatMoney(due)} due.`
                      : Number(amount) === due
                        ? "This settles the due in full."
                        : `${formatMoney(due - Number(amount))} will remain due.`}
                  </p>
                )}
              </div>
              {mode === "payment" && (
                <>
                  <div>
                    <label className={labelCls}>Method</label>
                    <ThemedSelect
                      value={method}
                      onChange={setMethod}
                      options={METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))}
                    />
                  </div>
                  {method !== "cash" && (
                    <div>
                      <label className={labelCls}>Trx ID (optional)</label>
                      <input
                        value={trxId}
                        onChange={(e) => setTrxId(e.target.value)}
                        maxLength={64}
                        placeholder={method === "bkash" ? "e.g. bKash TrxID" : "Bank transaction / cheque no."}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div>
            <label className={labelCls}>
              {mode === "adjustment" ? "Reason (required)" : mode === "payment" ? "Comment / Reference (optional)" : "Note (optional)"}
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} />
          </div>

          <FormMessage message={message} />

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "sale" ? "Book Sale" : mode === "payment" ? "Record Collection" : "Apply Adjustment"}
          </button>
          <p className="text-xs text-[var(--muted)]">Entries are permanent — use Waive / Correct to fix a mistake.</p>
        </form>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-medium">Temporary Customers</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5 text-xs font-medium">
                {(["open", "settled", "all"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 capitalize ${filter === f ? "bg-[var(--brand)] text-white" : "text-[var(--muted)]"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name"
                className="w-36 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-[var(--brand)]"
              />
            </div>
          </div>

          {customers === null ? (
            <p className="bh-empty">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="bh-empty">
              {all.length === 0
                ? "No temporary sales yet. Book one with the form — the due appears here and in Total Outstanding."
                : filter === "open"
                  ? "Nobody owes anything right now."
                  : "No customers match."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((c) => {
                const isOpen = expanded === c.key;
                return (
                  <li key={c.key} className="rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {c.entry_count} {c.entry_count === 1 ? "entry" : "entries"} · last {formatDay(c.last_activity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-right font-semibold ${c.due > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                        >
                          {c.due > 0 ? formatMoney(c.due) : "Settled"}
                        </span>
                        {c.due > 0 && (
                          <button
                            type="button"
                            onClick={() => startFor(c, "payment")}
                            className="whitespace-nowrap rounded-md bg-[var(--brand)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                          >
                            Collect
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startFor(c, "sale")}
                          className="whitespace-nowrap rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
                        >
                          + Sale
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : c.key)}
                          className="whitespace-nowrap rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                          aria-expanded={isOpen}
                        >
                          {isOpen ? "Hide" : "History"}
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="border-t border-[var(--border)] px-3 py-2">
                        {!history || history.key !== c.key ? (
                          <p className="py-3 text-center text-xs text-[var(--muted)]">Loading…</p>
                        ) : (
                          <ul className="divide-y divide-[var(--border)]">
                            {history.rows.map((r) => (
                              <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-xs">
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                        r.kind === "sale"
                                          ? "bg-red-500/15 text-red-500"
                                          : r.kind === "payment"
                                            ? "bg-emerald-500/15 text-emerald-600"
                                            : "bg-amber-500/15 text-amber-600"
                                      }`}
                                    >
                                      {r.kind === "adjustment" ? "adjust" : r.kind}
                                    </span>
                                    <span className="font-medium">
                                      {r.kind === "sale"
                                        ? `${r.sku_name} × ${r.quantity} @ ${formatMoney(r.unit_price ?? 0)}`
                                        : r.kind === "payment"
                                          ? (r.method ?? "").toUpperCase()
                                          : "Waived / corrected"}
                                    </span>
                                  </p>
                                  <p className="mt-0.5 text-[var(--muted)]">
                                    {formatDate(r.created_at)}
                                    {r.trx_id && <span className="font-mono"> · Trx ID: {r.trx_id}</span>}
                                    {r.note && ` · ${r.note}`}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`font-medium ${r.kind === "sale" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {r.kind === "sale" ? "+" : "−"}
                                    {formatMoney(r.amount)}
                                  </p>
                                  <p className="text-[var(--muted)]">due {formatMoney(r.balance_after)}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
