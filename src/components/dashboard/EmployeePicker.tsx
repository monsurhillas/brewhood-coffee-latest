"use client";

import { useEffect, useState } from "react";

export type EmployeeOption = {
  id: number;
  employee_id: string;
  name: string;
  balance: number;
};

export default function EmployeePicker({
  selected,
  onSelect,
}: {
  selected: EmployeeOption | null;
  onSelect: (employee: EmployeeOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/employees?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setOptions(data.employees ?? []));
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <div className="relative">
      <input
        value={selected ? `${selected.name} (#${selected.employee_id})` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search employee by name or ID…"
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
      />
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
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>
                  {o.name} <span className="text-[var(--muted)]">#{o.employee_id}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
