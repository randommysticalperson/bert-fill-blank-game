import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  createGameSession,
  getGameSession,
  getSentenceById,
  getSentencesByDifficulty,
  saveSessionAnswer,
  updateGameSession,
} from "../db";
import type { Difficulty } from "../../drizzle/schema";

// ── Scoring constants ────────────────────────────────────────────────────────
const POINTS: Record<Difficulty, { full: number; hint: number }> = {
  Easy:   { full: 10, hint: 5  },
  Medium: { full: 20, hint: 10 },
  Hard:   { full: 30, hint: 15 },
};

const QUESTIONS_PER_GAME = 10;

/** Port the Python sidecar listens on. Override with env BERT_SIDECAR_PORT. */
const SIDECAR_URL = process.env.BERT_SIDECAR_URL ?? "http://127.0.0.1:8787";

// ── Sidecar health check (cached for 30 s) ───────────────────────────────────
let _sidecarAvailable: boolean | null = null;
let _sidecarCheckedAt = 0;

async function isSidecarAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_sidecarAvailable !== null && now - _sidecarCheckedAt < 30_000) {
    return _sidecarAvailable;
  }
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    _sidecarAvailable = res.ok;
  } catch {
    _sidecarAvailable = false;
  }
  _sidecarCheckedAt = now;
  return _sidecarAvailable;
}

// ── Sidecar fill-mask call ───────────────────────────────────────────────────
async function sidecarPredict(
  sentence: string,
  bertModel: string,
  topN: number
): Promise<string[]> {
  const res = await fetch(`${SIDECAR_URL}/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sentence, model: bertModel, top_k: topN }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sidecar returned ${res.status}`);
  const data = (await res.json()) as {
    predictions: { token: string; score: number }[];
  };
  return data.predictions.map((p) => p.token);
}

// ── LLM fill-mask fallback ───────────────────────────────────────────────────
async function llmPredict(sentence: string, topN: number): Promise<string[]> {
  const prompt = sentence.replace("[MASK]", "___");
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a fill-in-the-blank word prediction engine.
Given a sentence with a blank (shown as ___), return the top ${topN} most appropriate single words or short phrases that best fill the blank.
Respond ONLY with a JSON array of strings, ordered from most to least likely.
Example: ["word1","word2","word3","word4","word5"]
Do not include any explanation or extra text.`,
      },
      {
        role: "user",
        content: `Sentence: "${prompt}"\n\nReturn the top ${topN} predictions as a JSON array.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "predictions",
        strict: true,
        schema: {
          type: "object",
          properties: {
            predictions: { type: "array", items: { type: "string" } },
          },
          required: ["predictions"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const rawContent = response.choices?.[0]?.message?.content ?? "{}";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);
    const preds: string[] = parsed.predictions ?? [];
    return preds.slice(0, topN);
  } catch {
    return [];
  }
}

// ── Unified prediction router: sidecar → LLM fallback ───────────────────────
async function getPredictions(
  sentence: string,
  bertModel: string,
  topN = 5
): Promise<{ tokens: string[]; source: "sidecar" | "llm" }> {
  if (await isSidecarAvailable()) {
    try {
      const tokens = await sidecarPredict(sentence, bertModel, topN);
      if (tokens.length > 0) return { tokens, source: "sidecar" };
    } catch (err) {
      console.warn("[game] Sidecar predict failed, falling back to LLM:", err);
      _sidecarAvailable = false; // force re-check next call
    }
  }
  const tokens = await llmPredict(sentence, topN);
  return { tokens, source: "llm" };
}

// ── Normalise for comparison ─────────────────────────────────────────────────
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "");
}

function isMatch(playerAnswer: string, candidates: string[]): boolean {
  const p = normalise(playerAnswer);
  return candidates.some((c) => normalise(c) === p);
}

// ── BERT model keys (must match Python MODEL_META keys) ──────────────────────
const BERT_MODEL_KEYS = ["general", "medical", "clinical", "science", "finance", "legal"] as const;
type BertModelKey = (typeof BERT_MODEL_KEYS)[number];

// ── Router ───────────────────────────────────────────────────────────────────
export const gameRouter = router({
  /** Check whether the BERT sidecar is running */
  sidecarStatus: publicProcedure.query(async () => {
    const available = await isSidecarAvailable();
    if (!available) return { available: false, models: [] };

    try {
      const res = await fetch(`${SIDECAR_URL}/models`, {
        signal: AbortSignal.timeout(2_000),
      });
      const models = res.ok ? await res.json() : [];
      return { available: true, models };
    } catch {
      return { available: true, models: [] };
    }
  }),

  /** Start a new game session */
  startSession: publicProcedure
    .input(
      z.object({
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
      })
    )
    .mutation(async ({ input }) => {
      const difficulty = input.difficulty as Difficulty;
      const allSentences = await getSentencesByDifficulty(difficulty, QUESTIONS_PER_GAME);
      if (allSentences.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "No sentences found for this difficulty." });

      const sessionId = await createGameSession(difficulty);
      const maxScore = allSentences.length * POINTS[difficulty].full;
      await updateGameSession(sessionId, { totalQuestions: allSentences.length, maxScore });

      return {
        sessionId,
        totalQuestions: allSentences.length,
        maxScore,
        bertModel: input.bertModel,
        sentences: allSentences.map((s) => ({
          id: s.id,
          text: s.text,
          difficulty: s.difficulty,
          domain: s.domain,
        })),
      };
    }),

  /** Get hint for a sentence */
  getHint: publicProcedure
    .input(
      z.object({
        sentenceId: z.number(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const difficulty = input.difficulty as Difficulty;
      const { tokens, source } = await getPredictions(sentence.text, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, sentence.answer]));

      const hint = combined[0] ?? sentence.answer;
      const revealChars = difficulty === "Easy" ? 3 : difficulty === "Medium" ? 2 : 1;
      const maskedHint =
        hint.slice(0, revealChars) + "*".repeat(Math.max(0, hint.length - revealChars));

      return {
        hint: maskedHint,
        fullHint: hint,
        pointPenalty: POINTS[difficulty].full - POINTS[difficulty].hint,
        pointsIfCorrect: POINTS[difficulty].hint,
        source,
      };
    }),

  /** Submit an answer */
  submitAnswer: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        sentenceId: z.number(),
        playerAnswer: z.string(),
        hintUsed: z.boolean(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const session = await getGameSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });

      const difficulty = input.difficulty as Difficulty;
      const { tokens, source } = await getPredictions(sentence.text, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, sentence.answer]));

      const isCorrect = isMatch(input.playerAnswer, combined);
      const basePoints = POINTS[difficulty].full;
      const hintPoints = POINTS[difficulty].hint;
      const pointsEarned = isCorrect ? (input.hintUsed ? hintPoints : basePoints) : 0;

      await saveSessionAnswer({
        sessionId: input.sessionId,
        sentenceId: input.sentenceId,
        playerAnswer: input.playerAnswer,
        isCorrect,
        hintUsed: input.hintUsed,
        pointsEarned,
      });

      await updateGameSession(input.sessionId, {
        correctAnswers: session.correctAnswers + (isCorrect ? 1 : 0),
        totalScore: session.totalScore + pointsEarned,
      });

      return {
        isCorrect,
        pointsEarned,
        correctAnswer: sentence.answer,
        predictions: combined,
        source,
      };
    }),

  /** Finalise the session */
  finishSession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = await getGameSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await updateGameSession(input.sessionId, { completedAt: new Date() });
      return {
        totalScore: session.totalScore,
        maxScore: session.maxScore,
        correctAnswers: session.correctAnswers,
        totalQuestions: session.totalQuestions,
        difficulty: session.difficulty,
      };
    }),
});
