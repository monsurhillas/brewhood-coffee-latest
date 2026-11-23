"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatDay, formatMoney } from "@/lib/format";
import type { EditChange, EditRecord } from "@/lib/entryEdits";

function fmtValue(kind: EditChange["kind"], v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "money") return formatMoney(Number(v));
  if (kind === "date") return formatDay(new Date(`${v}T00:00:00`));
  return String(v);
}

export function ChangeLine({ c }: { c: EditChange }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-[var(--muted)]">{c.label}:</span>
      <span className="line-through opacity-70">{fmtValue(c.kind, c.from)}</span>
      <span aria-hidden>→</span>
      <span className="font-medium">{fmtValue(c.kind, c.to)}</span>
    </li>
  );
}

// "Edited" pill. Hover (or focus / tap) shows when each edit happened, who made
// it, the remarks and what changed. The popover is position:fixed so it is not
// clipped by the tables' horizontal-scroll containers.
function EditedBadge({ edits }: { edits: EditRecord[] }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const hide = () => setPos(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  function show() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(340, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        onClick={() => (pos ? setPos(null) : show())}
        aria-label={`Edited ${edits.length} time${edits.length === 1 ? "" : "s"} — show history`}
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
        Edited{edits.length > 1 ? ` ×${edits.length}` : ""}
      </button>
      {pos && (
        <div
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.min(340, window.innerWidth - 16), transform: pos.above ? "translateY(-100%)" : undefined }}
          className="z-[60] max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left text-xs shadow-lg"
        >
          <p className="mb-2 font-semibold">Edit history</p>
          <ol className="flex flex-col gap-3">
            {edits.map((e) => (
              <li key={e.id} className="border-t border-[var(--border)] pt-2 first:border-0 first:pt-0">
                <p className="text-[var(--muted)]">
                  {formatDate(e.edited_at)}
                  {e.edited_by ? ` · ${e.edited_by}` : ""}
                </p>
                <p className="mt-0.5 font-medium">&ldquo;{e.remarks}&rdquo;</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {e.changes.map((c) => (
                    <ChangeLine key={c.field} c={c} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

// What the "When" / actions column shows for one entry: the Edited badge (if it
// was ever edited) and an Edit button while it is still inside the 30-day window.
export default function EntryEditControls({
  editable,
  edits,
  onEdit,
  note,
}: {
  editable: boolean;
  edits: EditRecord[];
  onEdit: () => void;
  note?: string; // shown instead of the button when the row can't be edited here
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {edits.length > 0 && <EditedBadge edits={edits} />}
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          Edit
        </button>
      )}
      {!editable && note && <span className="text-[11px] text-[var(--muted)]">{note}</span>}
    </span>
  );
}
