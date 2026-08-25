"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

export type EmployeeOption = {
  id: number;
  employee_id: string;
  name: string;
  balance: number;
};

function balanceClass(balance: number): string {
  if (balance < 0) return "text-red-500";
  if (balance > 0) return "text-emerald-600";
  return "text-[var(--muted)]";
}

export default function EmployeePicker({
  selected,
  onSelect,
}: {
  selected: EmployeeOption | null;
  onSelect: (employee: EmployeeOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/employees?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setOptions(data.employees ?? []));
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  // Close the dropdown on any click outside this picker — otherwise it
  // stays open (or the click just lands behind it) until something else
  // happens to close it.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function clearSelection() {
    onSelect(null);
    setQuery("");
    setOpen(true);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={selected ? `${selected.name} (#${selected.employee_id})` : query}
        onChange={(e) => {
          // Once something is picked, the field shows "Name (#id)" instead
          // of a live query — typing or backspacing into it (the whole
          // value gets selected on focus, below) should drop the pick and
          // resume searching from whatever's left, rather than being stuck
          // showing the old selection until another tab is visited.
          if (selected) onSelect(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          if (selected) e.currentTarget.select();
        }}
        placeholder="Search employee by name or ID…"
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 pr-8 text-sm outline-none focus:border-[var(--brand)]"
      />
      {selected && (
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Clear selected employee"
          title="Clear selected employee"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] hover:text-[var(--brand)]"
        >
          ×
        </button>
      )}
      {selected && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Current balance:{" "}
          <span className={`font-semibold ${balanceClass(selected.balance)}`}>
            {formatMoney(selected.balance)}
          </span>
        </p>
      )}
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(o);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>
                  {o.name} <span className="text-[var(--muted)]">#{o.employee_id}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${balanceClass(o.balance)}`}>
                  {formatMoney(o.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
