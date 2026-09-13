// Drink-consumption breakdown behind the "coffee mug" visual and the
// "Favourite Drink" tag on an employee's public share page
// (EmployeeSharePage.tsx via CoffeeMug.tsx). Kept separate from ledger.ts's
// balance math (which is dependency-free by design) so this can evolve —
// new drinks, new shades — without touching the money logic.
//
// Only *counted* sale rows should ever be passed in here (see ledger.ts's
// `counted` flag): a pre-import legacy row predates the employee's own
// activity in this app, and its quantity can't always be trusted anyway
// (see /api/admin/backfill-sale-quantities — the old system's export had no
// per-line quantity, so historical rows were loaded as "1 unit" regardless
// of what was actually bought). The share page already excludes these same
// rows from "Recent Transactions" for the same reason.

export type DrinkSlice = {
  name: string; // canonical display name, e.g. "Americano"
  qty: number; // total units bought, after merging name variants
  pct: number; // 0-100, whole percent, all slices sum to exactly 100
  mugColor: string; // hex shade this drink is drawn as in the mug
};

// A menu item's SKU name sometimes carries a "2X" (double-shot) suffix as
// its own distinct, separately-priced product — e.g. "Americano 2X" sits
// next to "Americano" as its own checkbox column on the paper sales sheet
// (see api/ocr/extract's prompt) — but for a "what does this person drink"
// breakdown that's the same drink, just a bigger pour. Strip a trailing
// "2X"/"2x" (with or without a preceding space) off any drink name, so
// "Americano 2X" folds into "Americano" and "Espresso 2X" into "Espresso".
export function normalizeDrinkName(rawName: string): string {
  return rawName.trim().replace(/\s*2x$/i, "").trim();
}

// Curated shade per known drink, roughly dark-roast -> milky so the mug
// reads as an actual layered coffee rather than an arbitrary categorical
// chart. A manager-added menu item this app has never seen before falls
// back to FALLBACK_SHADES, assigned in the order it first appears.
const DRINK_SHADES: Record<string, string> = {
  espresso: "#2e1b10",
  "cold brew": "#3b2415",
  "black coffee": "#3b2415",
  "filter coffee": "#40260f",
  americano: "#5a3a22",
  mocha: "#6b2f22",
  macchiato: "#7a5030",
  cappuccino: "#a9754f",
  cortado: "#b98a5e",
  "flat white": "#c9a06a",
  latte: "#d9b98c",
};

const FALLBACK_SHADES = ["#8a5a35", "#c69c6d", "#6b4226", "#a9754f", "#5c3324"];

export function drinkColor(name: string, fallbackIndex: number): string {
  const key = name.trim().toLowerCase();
  return DRINK_SHADES[key] ?? FALLBACK_SHADES[fallbackIndex % FALLBACK_SHADES.length];
}

export function computeDrinkBreakdown(
  sales: { description: string | null; quantity: number | null }[]
): { slices: DrinkSlice[]; favorite: string | null } {
  const totals = new Map<string, number>();
  for (const s of sales) {
    if (!s.description) continue;
    const name = normalizeDrinkName(s.description);
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + (s.quantity ?? 1));
  }

  const totalQty = [...totals.values()].reduce((a, b) => a + b, 0);
  if (totalQty === 0) return { slices: [], favorite: null };

  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  // Largest-remainder rounding: whole percents that still sum to exactly
  // 100, so the mug always looks fully poured instead of landing on 99 or
  // 101 after each slice is rounded independently.
  const raw = ordered.map(([, qty]) => (qty / totalQty) * 100);
  const floors = raw.map(Math.floor);
  const remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) floors[byRemainder[k].i] += 1;

  const slices: DrinkSlice[] = ordered.map(([name, qty], i) => ({
    name,
    qty,
    pct: floors[i],
    mugColor: drinkColor(name, i),
  }));

  return { slices, favorite: slices[0]?.name ?? null };
}

// Theme-aware pill styling for a drink's color: blending the drink's own
// hue with the page's own ink/surface tokens (rather than using the raw hex
// as a flat background) means the same style call reads correctly in both
// light and dark mode without a separate dark-mode table — the blend leans
// toward whatever "readable" means in the current theme automatically.
export function drinkTagStyle(hex: string): { backgroundColor: string; color: string; borderColor: string } {
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 16%, var(--card))`,
    color: `color-mix(in srgb, ${hex} 70%, var(--foreground))`,
    borderColor: `color-mix(in srgb, ${hex} 30%, var(--border))`,
  };
}
