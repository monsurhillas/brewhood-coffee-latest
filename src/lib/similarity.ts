// Lightweight fuzzy string matching for reconciling OCR'd handwritten names
// against the employee directory. No external dependency — just a small
// Levenshtein distance plus a token-overlap score, so short handwritten
// variants ("Md Rakib" vs "Md. Rakibuzzaman") still surface a reasonable
// best guess for the manager to confirm or override.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function charSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(charSimilarity(na, nb), tokenSimilarity(na, nb));
}

export function bestMatch<T extends { label: string }>(
  raw: string,
  candidates: T[]
): { candidate: T | null; score: number } {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = nameSimilarity(raw, c.label);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { candidate: best, score: bestScore };
}
