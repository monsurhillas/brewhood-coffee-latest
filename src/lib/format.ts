export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}৳${abs.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDay(d);
}

export function formatDay(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Single source of truth for the app's money-color convention, so it can't
// drift between screens again: balance > 0 means the shop owes the
// employee (an advance/credit) and is green; balance < 0 means the
// employee owes the shop (outstanding/due) and is red.
export function balanceClass(balance: number): string {
  if (balance < 0) return "text-red-500";
  if (balance > 0) return "text-emerald-600";
  return "text-[var(--muted)]";
}

// Same convention applied to individual transactions: a collection is
// money coming in (green); a sale, a manager cost, or a contra correction
// (which reverses a mistaken collection) all point the other way (red).
export function amountClass(type: string): string {
  return type === "collection" ? "text-emerald-600" : "text-red-500";
}
