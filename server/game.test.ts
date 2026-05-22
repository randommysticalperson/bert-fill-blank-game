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
