// Lightweight fuzzy string matching for reconciling OCR'd handwritten names
// against the employee directory. No external dependency — just a small
// Levenshtein distance plus a token-overlap score, so short handwritten
// variants ("Md Rakib" vs "Md. Rakibuzzaman") still surface a reasonable
// best guess for the manager to confirm or override.
//
// Handwritten logs are often informal — "Nihan vai", "Rakib bhai" — using a
// first name plus a Bangla honorific rather than the full name on file
// ("Nihan Ahmed"). Those honorifics are stripped before matching, and an
// exact single-word match against one token of a candidate's full name is
// treated as a strong (but not certain) signal, the way a manager skimming
// the sheet would recognize a coworker by first name alone.

const HONORIFIC_WORDS = new Set([
  "vai",
  "bhai",
  "bhaiya",
  "bhaia",
  "vaiya",
  "vaia",
  "bro",
  "apu",
  "apa",
  "appa",
  "appu",
  "sir",
  "boss",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHonorifics(tokens: string[]): string[] {
  const filtered = tokens.filter((t) => !HONORIFIC_WORDS.has(t));
  // Never strip every token away — if the whole name is somehow just an
  // honorific, fall back to matching on it as-is rather than matching nothing.
  return filtered.length > 0 ? filtered : tokens;
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

function tokenSimilarity(ta: string[], tb: string[]): number {
  const setA = new Set(ta);
  const setB = new Set(tb);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const tokensA = stripHonorifics(na.split(" ").filter(Boolean));
  const tokensB = stripHonorifics(nb.split(" ").filter(Boolean));
  const strippedA = tokensA.join(" ");
  const strippedB = tokensB.join(" ");

  let score = Math.max(charSimilarity(strippedA, strippedB), tokenSimilarity(tokensA, tokensB));

  // Nickname / first-name-only heuristic: a handwritten single-word name
  // (after stripping an honorific like "vai") that exactly matches one
  // token of the full employee name is a strong signal — coworkers commonly
  // refer to each other by first name only. Kept below 1.0 since a shared
  // first name across employees is still possible.
  if (tokensA.length === 1 && tokensA[0].length >= 3 && tokensB.includes(tokensA[0])) {
    score = Math.max(score, 0.8);
  } else if (tokensB.length === 1 && tokensB[0].length >= 3 && tokensA.includes(tokensB[0])) {
    score = Math.max(score, 0.8);
  }

  return score;
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
