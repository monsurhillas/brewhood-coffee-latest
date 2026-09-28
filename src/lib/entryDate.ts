// Shared by /api/sales and /api/collections' POST handlers, and by the
// Entry Date control in the Sale Entry / Collection Entry tabs
// (useEntryDate.ts + EntryDateBar.tsx) — lets a manager backdate a single
// entry to cover a day they forgot to log. Same idea as the bulk OCR
// upload's `date` field (see api/ocr/commit), just for one entry at a time:
// `created_at` becomes noon on the chosen date (matching how ocr/commit
// turns a plain date into a timestamp, a stable unsurprising anchor rather
// than midnight), while `uploaded_at` keeps recording the real insert time
// via its own column default (see db.ts's comment on that column) — this
// module never touches it.
//
// "Today" is always Dhaka's calendar day (BrewHood is a Bangladesh
// business, UTC+6, no DST), never the browser's or server's own timezone.
// That matters right around midnight Dhaka time: a Vercel function's clock
// runs UTC, six hours behind — without pinning this to Dhaka, a manager
// logging a late sale at, say, 1 AM Dhaka time could have today's own date
// rejected server-side as "in the future" even though the date picker
// (also pinned to Dhaka here) correctly let them pick it.

const DHAKA_TZ = "Asia/Dhaka";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function todayInDhaka(): string {
  // en-CA formats as YYYY-MM-DD directly, so there's no reformatting step.
  return new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(new Date());
}

export function isFutureDateString(value: string): boolean {
  // Both sides are zero-padded YYYY-MM-DD, so a plain string compare is a
  // correct date compare.
  return value > todayInDhaka();
}

// Noon on the chosen date, server-local — the same anchor api/ocr/commit
// already uses for a bulk-uploaded row's created_at, so a backdated single
// entry sorts and displays consistently with one that came in via upload.
export function dateStringToTimestamp(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}
