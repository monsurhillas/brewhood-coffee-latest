"use client";

import { useEffect, useRef, useState } from "react";

export type ThemedSelectOption = { value: string; label: string };

// A drop-in replacement for a native <select>. We use this instead of the
// browser's own <select> because the native option popup is rendered by the
// OS/platform widget toolkit and does not reliably follow the page's
// light/dark theme (it can render pale, near-invisible text on some
// platforms even when `color-scheme` is set correctly). This version is
// fully themed with our own CSS variables, so it always matches the app.
export default function ThemedSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-left text-sm outline-none focus:border-[var(--brand)]"
      >
        <span className={selected ? "" : "text-[var(--muted)]"}>
          {selected ? selected.label : (placeholder ?? "Select…")}
        </span>
        <span className="ml-2 shrink-0 text-[var(--muted)]">▾</span>
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10 ${
                  o.value === value ? "bg-[var(--brand)]/10 font-medium text-[var(--brand)]" : ""
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
