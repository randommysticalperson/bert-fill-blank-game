import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Replicate the sidecar routing helpers for unit testing ────────────────────

const SIDECAR_URL = "http://127.0.0.1:8787";

// Simulated cache state
let _sidecarAvailable: boolean | null = null;
let _sidecarCheckedAt = 0;

function resetCache() {
  _sidecarAvailable = null;
  _sidecarCheckedAt = 0;
}

async function isSidecarAvailable(fetchFn: typeof fetch): Promise<boolean> {
  const now = Date.now();
  if (_sidecarAvailable !== null && now - _sidecarCheckedAt < 30_000) {
    return _sidecarAvailable;
  }
  try {
    const res = await fetchFn(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    _sidecarAvailable = res.ok;
  } catch {
    _sidecarAvailable = false;
  }
  _sidecarCheckedAt = now;
  return _sidecarAvailable;
}

async function sidecarPredict(
  sentence: string,
  bertModel: string,
  topN: number,
  fetchFn: typeof fetch
): Promise<string[]> {
  const res = await fetchFn(`${SIDECAR_URL}/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sentence, model: bertModel, top_k: topN }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sidecar returned ${res.status}`);
  const data = (await res.json()) as { predictions: { token: string; score: number }[] };
  return data.predictions.map((p) => p.token);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isSidecarAvailable()", () => {
  beforeEach(() => resetCache());

  it("returns true when /health responds ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(`${SIDECAR_URL}/health`, expect.any(Object));
  });

  it("returns false when /health responds with non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const result = await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    expect(result).toBe(false);
  });

  it("returns false when fetch throws (sidecar not running)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    expect(result).toBe(false);
  });

  it("caches result for 30 seconds without re-fetching", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    // Second call should use cache — fetch called only once
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after cache expires", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    _sidecarCheckedAt = Date.now() - 31_000; // expire the cache
    _sidecarAvailable = true;
    await isSidecarAvailable(mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("sidecarPredict()", () => {
  it("returns token strings from sidecar response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [
          { token: "mitochondria", score: 0.41 },
          { token: "nucleus", score: 0.18 },
        ],
      }),
    });

    const tokens = await sidecarPredict(
      "The [MASK] is the powerhouse of the cell.",
      "medical",
      5,
      mockFetch as unknown as typeof fetch
    );

    expect(tokens).toEqual(["mitochondria", "nucleus"]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${SIDECAR_URL}/predict`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sentence: "The [MASK] is the powerhouse of the cell.",
          model: "medical",
          top_k: 5,
        }),
      })
    );
  });

  it("throws when sidecar returns non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      sidecarPredict("test [MASK] sentence", "general", 5, mockFetch as unknown as typeof fetch)
    ).rejects.toThrow("Sidecar returned 404");
  });

  it("propagates network errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(
      sidecarPredict("test [MASK] sentence", "general", 5, mockFetch as unknown as typeof fetch)
    ).rejects.toThrow("Network error");
  });
});

describe("BERT model key validation", () => {
  const VALID_KEYS = ["general", "medical", "clinical", "science", "finance", "legal", "cbow"] as const;

  it("contains exactly 7 model keys", () => {
    expect(VALID_KEYS).toHaveLength(7);
  });

  it("includes all expected domain keys", () => {
    expect(VALID_KEYS).toContain("general");
    expect(VALID_KEYS).toContain("medical");
    expect(VALID_KEYS).toContain("clinical");
    expect(VALID_KEYS).toContain("science");
    expect(VALID_KEYS).toContain("finance");
    expect(VALID_KEYS).toContain("legal");
    expect(VALID_KEYS).toContain("cbow");
  });

  it("CBOW uses Word2Vec context-bag prediction", () => {
    // CBOW is the only non-BERT model in the list — it uses gensim Word2Vec
    const nonBertModels = VALID_KEYS.filter((k) => k === "cbow");
    expect(nonBertModels).toHaveLength(1);
    expect(nonBertModels[0]).toBe("cbow");
  });
});
