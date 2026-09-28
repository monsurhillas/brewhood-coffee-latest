"use client";

import type { EntryDateState } from "@/lib/useEntryDate";

// Shown at the top of Sale Entry and Collection Entry so a manager can
// backdate every entry they're about to make — e.g. they forgot to log
// yesterday's activity, so they set this to yesterday, place the missed
// sales and collections, then reset it back to today. Deliberately loud
// (amber) while backdated: it's easy to forget you changed this and log a
// day's worth of entries against the wrong date.
export default function EntryDateBar({ entryDate }: { entryDate: EntryDateState }) {
  const { date, setDate, reset, isBackdated, today } = entryDate;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-xs ${
        isBackdated
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300"
          : "border-[var(--border)] bg-[var(--background)] text-[var(--muted)]"
      }`}
    >
      <label className="flex items-center gap-1.5 font-medium">
        Entry Date
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-current/30 bg-transparent px-2 py-1 text-xs text-current outline-none"
        />
      </label>
      <span>
        {isBackdated
          ? "Backdated — new entries will be logged on this date, not today."
          : "New entries are logged with today's date."}
      </span>
      {isBackdated && (
        <button
          type="button"
          onClick={reset}
          className="ml-auto rounded-md border border-current/30 px-2 py-1 font-medium hover:bg-black/5 dark:hover:bg-white/10"
        >
          Reset to Today
        </button>
      )}
    </div>
  );
}
