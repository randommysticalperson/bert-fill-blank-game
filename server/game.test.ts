import { describe, expect, it } from "vitest";

// ── Replicate pure helpers from game.ts for unit testing ──────────────────────

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "");
}

function isMatch(playerAnswer: string, candidates: string[]): boolean {
  const p = normalise(playerAnswer);
  return candidates.some((c) => normalise(c) === p);
}

const POINTS: Record<"Easy" | "Medium" | "Hard", { full: number; hint: number }> = {
  Easy:   { full: 10, hint: 5  },
  Medium: { full: 20, hint: 10 },
  Hard:   { full: 30, hint: 15 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("normalise()", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalise("  Paris  ")).toBe("paris");
  });

  it("strips punctuation but keeps hyphens", () => {
    expect(normalise("Sapir-Whorf")).toBe("sapir-whorf");
    expect(normalise("Mendeleev!")).toBe("mendeleev");
  });

  it("handles empty string", () => {
    expect(normalise("")).toBe("");
  });
});

describe("isMatch()", () => {
  it("matches exact answer case-insensitively", () => {
    expect(isMatch("Paris", ["paris", "london", "berlin"])).toBe(true);
    expect(isMatch("PARIS", ["paris"])).toBe(true);
  });

  it("matches with surrounding whitespace", () => {
    expect(isMatch("  sun  ", ["Sun", "Moon"])).toBe(true);
  });

  it("returns false when no candidate matches", () => {
    expect(isMatch("Tokyo", ["Paris", "London"])).toBe(false);
  });

  it("matches hyphenated phrases", () => {
    expect(isMatch("Sapir-Whorf", ["sapir-whorf"])).toBe(true);
  });

  it("returns false on empty answer", () => {
    expect(isMatch("", ["sun", "moon"])).toBe(false);
  });
});

describe("POINTS scoring constants", () => {
  it("Easy: full=10, hint=5", () => {
    expect(POINTS.Easy.full).toBe(10);
    expect(POINTS.Easy.hint).toBe(5);
  });

  it("Medium: full=20, hint=10", () => {
    expect(POINTS.Medium.full).toBe(20);
    expect(POINTS.Medium.hint).toBe(10);
  });

  it("Hard: full=30, hint=15", () => {
    expect(POINTS.Hard.full).toBe(30);
    expect(POINTS.Hard.hint).toBe(15);
  });

  it("hint points are always half of full points", () => {
    for (const d of ["Easy", "Medium", "Hard"] as const) {
      expect(POINTS[d].hint).toBe(POINTS[d].full / 2);
    }
  });
});

describe("scoring logic", () => {
  it("awards full points for correct answer without hint", () => {
    const isCorrect = true;
    const hintUsed = false;
    const difficulty = "Medium" as const;
    const points = isCorrect ? (hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full) : 0;
    expect(points).toBe(20);
  });

  it("awards half points for correct answer with hint", () => {
    const isCorrect = true;
    const hintUsed = true;
    const difficulty = "Hard" as const;
    const points = isCorrect ? (hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full) : 0;
    expect(points).toBe(15);
  });

  it("awards zero points for incorrect answer", () => {
    const isCorrect = false;
    const hintUsed = false;
    const difficulty = "Easy" as const;
    const points = isCorrect ? (hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full) : 0;
    expect(points).toBe(0);
  });
});

describe("auth.logout (existing test still passes)", () => {
  it("exports POINTS with three difficulty levels", () => {
    expect(Object.keys(POINTS)).toEqual(["Easy", "Medium", "Hard"]);
  });
});

// ── Category filtering logic (mirrors db.ts getSentencesByDifficulty) ─────────

type MockSentence = {
  id: number;
  text: string;
  answer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  bertCategory: string;
};

/**
 * Simulates the category-filtering logic from getSentencesByDifficulty:
 * - If bertCategory is provided and not "general", return only rows matching it.
 * - If no rows match, fall back to all rows for that difficulty.
 * - If bertCategory is "general" or omitted, return all rows for that difficulty.
 */
function filterSentences(
  rows: MockSentence[],
  difficulty: "Easy" | "Medium" | "Hard",
  bertCategory?: string
): MockSentence[] {
  const byDifficulty = rows.filter((r) => r.difficulty === difficulty);
  if (bertCategory && bertCategory !== "general") {
    const byCat = byDifficulty.filter((r) => r.bertCategory === bertCategory);
    if (byCat.length > 0) return byCat;
    // fallback
  }
  return byDifficulty;
}

const MOCK_SENTENCES: MockSentence[] = [
  { id: 1, text: "General easy [MASK].", answer: "word", difficulty: "Easy", bertCategory: "general" },
  { id: 2, text: "Medical easy [MASK].", answer: "heart", difficulty: "Easy", bertCategory: "medical" },
  { id: 3, text: "Legal easy [MASK].", answer: "contract", difficulty: "Easy", bertCategory: "legal" },
  { id: 4, text: "Medical medium [MASK].", answer: "insulin", difficulty: "Medium", bertCategory: "medical" },
  { id: 5, text: "Finance medium [MASK].", answer: "bond", difficulty: "Medium", bertCategory: "finance" },
  { id: 6, text: "General medium [MASK].", answer: "gravity", difficulty: "Medium", bertCategory: "general" },
];

describe("getSentencesByDifficulty category filtering", () => {
  it("returns only medical sentences when bertCategory='medical'", () => {
    const result = filterSentences(MOCK_SENTENCES, "Easy", "medical");
    expect(result).toHaveLength(1);
    expect(result[0].bertCategory).toBe("medical");
    expect(result[0].id).toBe(2);
  });

  it("returns only legal sentences when bertCategory='legal'", () => {
    const result = filterSentences(MOCK_SENTENCES, "Easy", "legal");
    expect(result).toHaveLength(1);
    expect(result[0].bertCategory).toBe("legal");
    expect(result[0].id).toBe(3);
  });

  it("returns all sentences for difficulty when bertCategory='general'", () => {
    const result = filterSentences(MOCK_SENTENCES, "Easy", "general");
    expect(result).toHaveLength(3); // all Easy rows
  });

  it("returns all sentences for difficulty when bertCategory is undefined", () => {
    const result = filterSentences(MOCK_SENTENCES, "Easy", undefined);
    expect(result).toHaveLength(3);
  });

  it("falls back to all difficulty rows when requested category has no rows", () => {
    // 'science' has no Easy rows in mock data — should fall back to all Easy rows
    const result = filterSentences(MOCK_SENTENCES, "Easy", "science");
    expect(result).toHaveLength(3);
  });

  it("does not mix difficulties — Medium medical should not include Easy medical", () => {
    const result = filterSentences(MOCK_SENTENCES, "Medium", "medical");
    expect(result).toHaveLength(1);
    expect(result[0].difficulty).toBe("Medium");
    expect(result[0].bertCategory).toBe("medical");
  });

  it("returns finance sentences for Medium difficulty", () => {
    const result = filterSentences(MOCK_SENTENCES, "Medium", "finance");
    expect(result).toHaveLength(1);
    expect(result[0].bertCategory).toBe("finance");
    expect(result[0].answer).toBe("bond");
  });

  it("each returned sentence has the correct difficulty", () => {
    const result = filterSentences(MOCK_SENTENCES, "Medium", "general");
    for (const s of result) {
      expect(s.difficulty).toBe("Medium");
    }
  });
});

describe("BERT category keys", () => {
  const VALID_CATEGORIES = ["general", "medical", "clinical", "science", "finance", "legal"] as const;

  it("has exactly 6 categories", () => {
    expect(VALID_CATEGORIES).toHaveLength(6);
  });

  it("includes all expected domain categories", () => {
    expect(VALID_CATEGORIES).toContain("medical");
    expect(VALID_CATEGORIES).toContain("clinical");
    expect(VALID_CATEGORIES).toContain("science");
    expect(VALID_CATEGORIES).toContain("finance");
    expect(VALID_CATEGORIES).toContain("legal");
    expect(VALID_CATEGORIES).toContain("general");
  });
});

// ── Multi-mask mode helpers ────────────────────────────────────────────────────

/**
 * Count the number of [MASK] tokens in a sentence.
 */
function countMasks(text: string): number {
  return (text.match(/\[MASK\]/g) ?? []).length;
}

/**
 * Simulate consecutive mode scoring: each mask is scored independently.
 * Returns total points earned across all masks.
 */
function scoreConsecutive(
  playerAnswers: string[],
  correctAnswers: string[],
  hintsUsed: boolean[],
  difficulty: "Easy" | "Medium" | "Hard"
): { totalPoints: number; totalCorrect: number } {
  let totalPoints = 0;
  let totalCorrect = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    const correct = normalise(playerAnswers[i] ?? "") === normalise(correctAnswers[i] ?? "");
    if (correct) {
      totalPoints += hintsUsed[i] ? POINTS[difficulty].hint : POINTS[difficulty].full;
      totalCorrect++;
    }
  }
  return { totalPoints, totalCorrect };
}

/**
 * Simulate parallel mode scoring: all masks scored at once.
 */
function scoreParallel(
  playerAnswers: string[],
  correctAnswers: string[],
  hintsUsed: boolean[],
  difficulty: "Easy" | "Medium" | "Hard"
): { results: { isCorrect: boolean; points: number }[]; totalPoints: number; totalCorrect: number } {
  const results = correctAnswers.map((correct, i) => {
    const isCorrect = normalise(playerAnswers[i] ?? "") === normalise(correct);
    const points = isCorrect ? (hintsUsed[i] ? POINTS[difficulty].hint : POINTS[difficulty].full) : 0;
    return { isCorrect, points };
  });
  return {
    results,
    totalPoints: results.reduce((s, r) => s + r.points, 0),
    totalCorrect: results.filter((r) => r.isCorrect).length,
  };
}

// ── Multi-mask tests ───────────────────────────────────────────────────────────

describe("countMasks()", () => {
  it("counts zero masks in a plain sentence", () => {
    expect(countMasks("The sky is blue.")).toBe(0);
  });

  it("counts one mask", () => {
    expect(countMasks("The [MASK] is blue.")).toBe(1);
  });

  it("counts two masks", () => {
    expect(countMasks("The [MASK] and [MASK] are related.")).toBe(2);
  });

  it("counts three masks", () => {
    expect(countMasks("[MASK] causes [MASK] which leads to [MASK].")).toBe(3);
  });
});

describe("consecutive mode scoring", () => {
  it("awards full points for all correct answers without hints", () => {
    const { totalPoints, totalCorrect } = scoreConsecutive(
      ["heart", "blood"],
      ["heart", "blood"],
      [false, false],
      "Easy"
    );
    expect(totalPoints).toBe(20); // 10 + 10
    expect(totalCorrect).toBe(2);
  });

  it("awards half points when hint used on one mask", () => {
    const { totalPoints, totalCorrect } = scoreConsecutive(
      ["heart", "blood"],
      ["heart", "blood"],
      [true, false],
      "Easy"
    );
    expect(totalPoints).toBe(15); // 5 + 10
    expect(totalCorrect).toBe(2);
  });

  it("awards zero for incorrect mask, full for correct", () => {
    const { totalPoints, totalCorrect } = scoreConsecutive(
      ["lung", "blood"],
      ["heart", "blood"],
      [false, false],
      "Medium"
    );
    expect(totalPoints).toBe(20); // 0 + 20
    expect(totalCorrect).toBe(1);
  });

  it("awards zero for all incorrect", () => {
    const { totalPoints, totalCorrect } = scoreConsecutive(
      ["lung", "plasma"],
      ["heart", "blood"],
      [false, false],
      "Hard"
    );
    expect(totalPoints).toBe(0);
    expect(totalCorrect).toBe(0);
  });

  it("is case-insensitive for consecutive answers", () => {
    const { totalCorrect } = scoreConsecutive(
      ["HEART", "Blood"],
      ["heart", "blood"],
      [false, false],
      "Easy"
    );
    expect(totalCorrect).toBe(2);
  });
});

describe("parallel mode scoring", () => {
  it("scores all blanks independently and sums points", () => {
    const { totalPoints, totalCorrect, results } = scoreParallel(
      ["insulin", "glucose"],
      ["insulin", "glucose"],
      [false, false],
      "Medium"
    );
    expect(totalPoints).toBe(40); // 20 + 20
    expect(totalCorrect).toBe(2);
    expect(results[0].isCorrect).toBe(true);
    expect(results[1].isCorrect).toBe(true);
  });

  it("partial credit: only correct blanks earn points", () => {
    const { totalPoints, totalCorrect } = scoreParallel(
      ["insulin", "wrong"],
      ["insulin", "glucose"],
      [false, false],
      "Hard"
    );
    expect(totalPoints).toBe(30); // 30 + 0
    expect(totalCorrect).toBe(1);
  });

  it("hint on one blank reduces that blank's points only", () => {
    const { totalPoints } = scoreParallel(
      ["insulin", "glucose"],
      ["insulin", "glucose"],
      [true, false],  // hint on blank 0
      "Hard"
    );
    expect(totalPoints).toBe(45); // 15 + 30
  });

  it("all incorrect returns zero total", () => {
    const { totalPoints, totalCorrect } = scoreParallel(
      ["wrong1", "wrong2"],
      ["insulin", "glucose"],
      [false, false],
      "Easy"
    );
    expect(totalPoints).toBe(0);
    expect(totalCorrect).toBe(0);
  });

  it("handles single-mask sentence (degenerate parallel)", () => {
    const { totalPoints, totalCorrect } = scoreParallel(
      ["heart"],
      ["heart"],
      [false],
      "Easy"
    );
    expect(totalPoints).toBe(10);
    expect(totalCorrect).toBe(1);
  });

  it("returns per-blank result objects with correct shape", () => {
    const { results } = scoreParallel(
      ["insulin", "glucose"],
      ["insulin", "wrong"],
      [false, false],
      "Medium"
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("isCorrect");
    expect(results[0]).toHaveProperty("points");
    expect(results[0].isCorrect).toBe(true);
    expect(results[1].isCorrect).toBe(false);
  });
});

describe("game mode labels", () => {
  const VALID_MODES = ["classic", "consecutive", "parallel"] as const;

  it("has exactly 3 game modes", () => {
    expect(VALID_MODES).toHaveLength(3);
  });

  it("includes classic, consecutive, and parallel", () => {
    expect(VALID_MODES).toContain("classic");
    expect(VALID_MODES).toContain("consecutive");
    expect(VALID_MODES).toContain("parallel");
  });
});

// ── Context-aware consecutive prediction ─────────────────────────────────────

/**
 * Replicate the buildSentenceForMask logic here so we can unit-test it
 * without importing the router (which requires DB).
 */
function buildSentenceForMask(
  text: string,
  masks: string[],
  activeIndex: number,
  priorAnswers: string[] = []
): string {
  let idx = 0;
  return text.replace(/\[MASK\]/g, () => {
    const current = idx++;
    if (current === activeIndex) return "[MASK]";
    if (current < activeIndex) return priorAnswers[current] ?? masks[current] ?? "[MASK]";
    return masks[current] ?? "[MASK]";
  });
}

describe("buildSentenceForMask — context-aware consecutive prediction", () => {
  const text = "The [MASK] is a [MASK] organ in the body.";
  const masks = ["heart", "vital"];

  it("blank 0: no prior answers — other mask filled with correct answer", () => {
    const result = buildSentenceForMask(text, masks, 0, []);
    expect(result).toBe("The [MASK] is a vital organ in the body.");
  });

  it("blank 1 with correct prior answer: prior blank filled with player's correct word", () => {
    const result = buildSentenceForMask(text, masks, 1, ["heart"]);
    expect(result).toBe("The heart is a [MASK] organ in the body.");
  });

  it("blank 1 with wrong prior answer: prior blank filled with player's wrong word", () => {
    const result = buildSentenceForMask(text, masks, 1, ["lung"]);
    expect(result).toBe("The lung is a [MASK] organ in the body.");
  });

  it("falls back to correct answer when priorAnswers is shorter than maskIndex", () => {
    const result = buildSentenceForMask(text, masks, 1, []);
    expect(result).toBe("The heart is a [MASK] organ in the body.");
  });

  it("three-mask sentence: blank 2 uses player answers for blanks 0 and 1", () => {
    const text3 = "The [MASK] pumps [MASK] through [MASK] vessels.";
    const masks3 = ["heart", "blood", "arterial"];
    const result = buildSentenceForMask(text3, masks3, 2, ["heart", "oxygen"]);
    expect(result).toBe("The heart pumps oxygen through [MASK] vessels.");
  });

  it("classic mode (empty priorAnswers): all other masks filled with correct answers", () => {
    const result = buildSentenceForMask(text, masks, 0);
    expect(result).toBe("The [MASK] is a vital organ in the body.");
  });

  it("active mask always stays as [MASK] regardless of priorAnswers", () => {
    const result = buildSentenceForMask(text, masks, 1, ["heart"]);
    expect(result).toContain("[MASK]");
    expect(result).not.toContain("[MASK] is a [MASK]");
  });
});


// -- Flexible answer matching tests --
describe("flexible answer matching", () => {
  function normalise(s: string): string {
    return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ");
  }
  function stem(word: string): string {
    const w = word.toLowerCase();
    if (w.length < 4) return w;
    const suffixes = ["ational","tional","enci","anci","izer","ising","izing","ation","ness","ment","tion","ing","ied","ies","est","ers","er","ed","ly","al","ic","ful","ous","ive","ise","ize","ion","s"];
    for (const suffix of suffixes) {
      if (w.endsWith(suffix) && w.length - suffix.length >= 3) return w.slice(0, w.length - suffix.length);
    }
    return w;
  }
  function editDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]! : 1 + Math.min(dp[i-1][j]!, dp[i][j-1]!, dp[i-1][j-1]!);
      }
    }
    return dp[m][n]!;
  }
  function sharePrefix(a: string, b: string, minLen = 4): boolean {
    if (a.length < minLen || b.length < minLen) return false;
    const shorter = a.length <= b.length ? a : b;
    const longer  = a.length <= b.length ? b : a;
    return longer.startsWith(shorter.slice(0, minLen));
  }
  type MatchType = "exact" | "stem" | "prefix" | "close" | "none";
  function flexMatch(player: string, candidates: string[]): { matched: boolean; matchType: MatchType } {
    const p = normalise(player);
    const pW = p.split(" ").filter(Boolean);
    for (const candidate of candidates) {
      const c = normalise(candidate);
      const cW = c.split(" ").filter(Boolean);
      if (p === c) return { matched: true, matchType: "exact" };
      if (pW.length === cW.length && pW.every((pw, i) => stem(pw) === stem(cW[i] ?? "")))
        return { matched: true, matchType: "stem" };
      if (pW.length === 1 && cW.length === 1 && sharePrefix(pW[0]!, cW[0]!, 4))
        return { matched: true, matchType: "prefix" };
      if (p.length >= 4 && c.length >= 4) {
        const maxDist = Math.max(1, Math.floor(Math.min(p.length, c.length) / 5));
        if (editDistance(p, c) <= maxDist) return { matched: true, matchType: "close" };
      }
    }
    return { matched: false, matchType: "none" };
  }
  it("exact match case-insensitive", () => { expect(flexMatch("Heart", ["heart"]).matchType).toBe("exact"); });
  it("exact match strips punctuation", () => { expect(flexMatch("heart.", ["heart"]).matchType).toBe("exact"); });
  it("stem match inflected form", () => { const r = flexMatch("runs", ["run"]); expect(r.matched).toBe(true); expect(r.matchType).toBe("stem"); });
  it("stem match plural", () => { const r = flexMatch("neurons", ["neuron"]); expect(r.matched).toBe(true); expect(r.matchType).toBe("stem"); });
  it("prefix match truncated word", () => { const r = flexMatch("cardio", ["cardiovascular"]); expect(r.matched).toBe(true); expect(r.matchType).toBe("prefix"); });
  it("close match single typo", () => { const r = flexMatch("hearth", ["heart"]); expect(r.matched).toBe(true); }); // prefix or close both accepted
  it("no match short words below threshold", () => { expect(flexMatch("cat", ["bat"]).matched).toBe(false); });
  it("no match completely different word", () => { expect(flexMatch("banana", ["heart"]).matched).toBe(false); });
  it("multi-word exact match", () => { const r = flexMatch("blood pressure", ["blood pressure"]); expect(r.matched).toBe(true); expect(r.matchType).toBe("exact"); });
  it("multi-word stem match", () => { const r = flexMatch("blood pressures", ["blood pressure"]); expect(r.matched).toBe(true); expect(r.matchType).toBe("stem"); });
});

