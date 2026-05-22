"""Replace the exact isMatch block in game.ts with a multi-layer flexible matcher."""
import re, sys

path = "server/routers/game.ts"
with open(path, "r") as f:
    content = f.read()

OLD = """// ── Normalise for comparison ─────────────────────────────────────────────────
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\\s-]/g, "");
}

function isMatch(playerAnswer: string, candidates: string[]): boolean {
  const p = normalise(playerAnswer);
  return candidates.some((c) => normalise(c) === p);
}"""

NEW = """// ── Flexible answer matching ─────────────────────────────────────────────────
//
// Answers are evaluated through four layers of leniency so the game behaves
// more like a human marker than a standardised-test answer key:
//
//   1. exact  — normalised strings are identical
//   2. stem   — both words reduce to the same stem (handles inflections)
//   3. prefix — one word is a prefix of the other (min 4 chars)
//   4. close  — edit distance ≤ max(1, floor(len/5))  (typo tolerance)
//
// The match type is returned to the frontend so a quality badge can be shown.

/** Strip punctuation, lowercase, collapse whitespace. */
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\\s-]/g, "").replace(/\\s+/g, " ");
}

/**
 * Stem a word using a simple suffix-stripping heuristic (Porter-lite).
 * Handles common English inflections: -ing, -ed, -er, -est, -s, -tion, -ness, -ly, -ment.
 */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 4) return w;
  const suffixes = [
    "ational", "tional", "enci", "anci", "izer", "ising", "izing",
    "ation", "ness", "ment", "tion",
    "ing", "ied", "ies", "est", "ers", "er", "ed", "ly", "al", "ic",
    "ful", "ous", "ive", "ise", "ize", "ion", "s",
  ];
  for (const suffix of suffixes) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  return w;
}

/** Levenshtein edit distance. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j]!, dp[i][j - 1]!, dp[i - 1][j - 1]!);
    }
  }
  return dp[m][n]!;
}

/** Whether two words share a common prefix of at least minLen characters. */
function sharePrefix(a: string, b: string, minLen = 4): boolean {
  if (a.length < minLen || b.length < minLen) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  return longer.startsWith(shorter.slice(0, minLen));
}

export type MatchType = "exact" | "stem" | "prefix" | "close" | "none";

/**
 * Multi-layer flexible evaluator.
 * Returns both whether the answer is accepted and the quality label.
 */
function flexMatch(
  playerAnswer: string,
  candidates: string[]
): { matched: boolean; matchType: MatchType } {
  const p      = normalise(playerAnswer);
  const pWords = p.split(" ").filter(Boolean);

  for (const candidate of candidates) {
    const c      = normalise(candidate);
    const cWords = c.split(" ").filter(Boolean);

    // Layer 1: exact
    if (p === c) return { matched: true, matchType: "exact" };

    // Layer 2: stem match (every word must stem-match)
    if (pWords.length === cWords.length) {
      const allStem = pWords.every((pw, i) => stem(pw) === stem(cWords[i] ?? ""));
      if (allStem) return { matched: true, matchType: "stem" };
    }

    // Layer 3: prefix match (single-word answers only)
    if (pWords.length === 1 && cWords.length === 1) {
      if (sharePrefix(pWords[0]!, cWords[0]!, 4)) {
        return { matched: true, matchType: "prefix" };
      }
    }

    // Layer 4: edit-distance typo tolerance (answers ≥ 4 chars)
    if (p.length >= 4 && c.length >= 4) {
      const maxDist = Math.max(1, Math.floor(Math.min(p.length, c.length) / 5));
      if (editDistance(p, c) <= maxDist) {
        return { matched: true, matchType: "close" };
      }
    }
  }

  return { matched: false, matchType: "none" };
}

/** Backward-compatible boolean wrapper. */
function isMatch(playerAnswer: string, candidates: string[]): boolean {
  return flexMatch(playerAnswer, candidates).matched;
}

/** Returns both the boolean result and the match quality label. */
function isMatchWithType(
  playerAnswer: string,
  candidates: string[]
): { isCorrect: boolean; matchType: MatchType } {
  const { matched, matchType } = flexMatch(playerAnswer, candidates);
  return { isCorrect: matched, matchType };
}"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: flexible matcher patched into game.ts")
else:
    print("ERROR: old block not found — printing surrounding context")
    idx = content.find("function normalise")
    print(repr(content[idx:idx+300]))
    sys.exit(1)
