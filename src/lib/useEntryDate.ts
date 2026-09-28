"use client";

import { useEffect, useState } from "react";
import { todayInDhaka, isFutureDateString } from "@/lib/entryDate";

const STORAGE_KEY = "brewhood:entry_date";

// Shared between Sale Entry and Collection Entry (each reads this fresh on
// mount, since DashboardShell only ever keeps the active tab mounted) so
// switching tabs keeps whatever backdate the manager set — the point is to
// change the date once, log a whole missed day's sales and collections,
// then switch it back. Lives in sessionStorage rather than plain component
// state so it survives an accidental page refresh but clears itself once
// the browser tab closes, matching "stays until I change it back or the
// session resets".
export function useEntryDate() {
  const today = todayInDhaka();
  const [date, setDateState] = useState(today);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && !isFutureDateString(stored)) {
        setDateState(stored);
      } else if (stored) {
        // A stored date that's somehow past "today" (clock skew, or the
        // stored value was written on a different day and never reset) is
        // never silently used — drop it rather than risk a future-dated entry.
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // sessionStorage can throw in locked-down/private-browsing contexts —
      // the control still works, it just won't persist across a refresh.
    }
  }, []);

  function setDate(next: string) {
    if (!next) return;
    const clamped = isFutureDateString(next) ? todayInDhaka() : next;
    setDateState(clamped);
    try {
      sessionStorage.setItem(STORAGE_KEY, clamped);
    } catch {
      // best-effort only
    }
  }

  function reset() {
    const t = todayInDhaka();
    setDateState(t);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort only
    }
  }

  return { date, setDate, reset, isBackdated: date !== today, today };
}

export type EntryDateState = ReturnType<typeof useEntryDate>;
