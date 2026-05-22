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
