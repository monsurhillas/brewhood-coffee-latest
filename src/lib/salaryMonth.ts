// Shared "which month" helpers for the Salary tab and the Analytics tab's
// "Daily Coffee Sales" view — same Dhaka-local convention as entryDate.ts
// (BrewHood is a Bangladesh business, UTC+6, no DST), so "this month"
// always means the calendar month in Dhaka, never the server's or
// browser's own timezone.

const DHAKA_TZ = "Asia/Dhaka";
const MONTH_RE = /^\d{4}-\d{2}$/;

export function isValidMonthString(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function currentMonthInDhaka(): string {
  // en-CA gives YYYY-MM-DD directly; the first 7 characters are YYYY-MM.
  return new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(new Date()).slice(0, 7);
}

// Every calendar day in the given YYYY-MM month, as YYYY-MM-DD strings, in
// order — used so a day with zero coffee sales still shows up as a zero
// row instead of silently disappearing from the report.
export function daysInMonth(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
