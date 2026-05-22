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
import type { Difficulty, GameMode } from "../../drizzle/schema";

// ── Scoring constants ────────────────────────────────────────────────────────
const POINTS: Record<Difficulty, { full: number; hint: number }> = {
  Easy:   { full: 10, hint: 5  },
  Medium: { full: 20, hint: 10 },
  Hard:   { full: 30, hint: 15 },
};

const QUESTIONS_PER_GAME = 10;

/** Port the Python sidecar listens on. Override with env BERT_SIDECAR_URL. */
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
  const prompt = sentence.replace(/\[MASK\]/g, "___");
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a fill-in-the-blank word prediction engine.
Given a sentence with one blank (shown as ___), return the top ${topN} most appropriate single words or short phrases that best fill that blank.
Respond ONLY with a JSON object: {"predictions": ["word1","word2",...]}
Order from most to least likely. Do not include any explanation.`,
      },
      {
        role: "user",
        content: `Sentence: "${prompt}"\n\nReturn the top ${topN} predictions as a JSON object.`,
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

// ── Unified prediction: sidecar → LLM fallback ──────────────────────────────
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
      _sidecarAvailable = false;
    }
  }
  const tokens = await llmPredict(sentence, topN);
  return { tokens, source: "llm" };
}

/**
 * Build a version of the sentence for prediction.
 *
 * - The token at `activeIndex` stays as [MASK] for BERT/LLM to fill.
 * - Tokens BEFORE activeIndex are filled with `priorAnswers[i]` (the player's
 *   actual answers so far) — this gives BERT real context from the game.
 * - Tokens AFTER activeIndex are filled with the correct answer (so the model
 *   sees a grammatically complete sentence on both sides of the active blank).
 *
 * For classic / parallel mode, pass an empty priorAnswers array.
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
    // Before the active blank: use what the player actually typed
    if (current < activeIndex) return priorAnswers[current] ?? masks[current] ?? "[MASK]";
    // After the active blank: use the correct answer for grammatical context
    return masks[current] ?? "[MASK]";
  });
}

// ── Normalise for comparison ─────────────────────────────────────────────────
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "");
}

function isMatch(playerAnswer: string, candidates: string[]): boolean {
  const p = normalise(playerAnswer);
  return candidates.some((c) => normalise(c) === p);
}

// ── BERT model keys ──────────────────────────────────────────────────────────
const BERT_MODEL_KEYS = ["general", "medical", "clinical", "science", "finance", "legal"] as const;
type BertModelKey = (typeof BERT_MODEL_KEYS)[number];

const GAME_MODE_KEYS = ["classic", "consecutive", "parallel"] as const;

// ── Router ───────────────────────────────────────────────────────────────────
export const gameRouter = router({
  /** Check whether the BERT sidecar is running */
  sidecarStatus: publicProcedure.query(async () => {
    const available = await isSidecarAvailable();
    if (!available) return { available: false, models: [] };
    try {
      const res = await fetch(`${SIDECAR_URL}/models`, { signal: AbortSignal.timeout(2_000) });
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
        gameMode: z.enum(GAME_MODE_KEYS).optional().default("classic"),
      })
    )
    .mutation(async ({ input }) => {
      const difficulty = input.difficulty as Difficulty;
      const gameMode = input.gameMode as GameMode;
      const allSentences = await getSentencesByDifficulty(
        difficulty,
        QUESTIONS_PER_GAME,
        input.bertModel,
        gameMode
      );
      if (allSentences.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "No sentences found for this difficulty and mode." });

      const sessionId = await createGameSession(difficulty, gameMode);

      // For multi-mask modes, max score accounts for all masks per sentence
      const maxScore = allSentences.reduce((acc, s) => {
        const maskCount = (s.text.match(/\[MASK\]/g) ?? []).length;
        return acc + POINTS[difficulty].full * Math.max(1, maskCount);
      }, 0);

      await updateGameSession(sessionId, { totalQuestions: allSentences.length, maxScore });

      return {
        sessionId,
        totalQuestions: allSentences.length,
        maxScore,
        bertModel: input.bertModel,
        gameMode,
        sentences: allSentences.map((s) => {
          const masksArr: string[] = (() => {
            try { return JSON.parse(s.masks || "[]"); } catch { return [s.answer]; }
          })();
          // Word count per mask so the frontend can render _ _ _ placeholders
          const maskWordCounts = masksArr.map((m) => m.trim().split(/\s+/).length);
          return {
            id: s.id,
            text: s.text,
            difficulty: s.difficulty,
            domain: s.domain,
            gameMode: s.gameMode,
            maskCount: masksArr.length,
            maskWordCounts,
          };
        }),
      };
    }),

  /** Get hint for a specific mask in a sentence */
  getHint: publicProcedure
    .input(
      z.object({
        sentenceId: z.number(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
        /** Which [MASK] index to hint (0-based). Default 0 for classic mode. */
        maskIndex: z.number().int().min(0).optional().default(0),
        /**
         * Consecutive mode: the player's answers for all prior blanks.
         * Used to build a context-aware sentence for BERT prediction.
         */
        priorAnswers: z.array(z.string()).optional().default([]),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const difficulty = input.difficulty as Difficulty;
      const masks: string[] = (() => {
        try { return JSON.parse(sentence.masks || "[]"); } catch { return [sentence.answer]; }
      })();
      const correctAnswer = masks[input.maskIndex] ?? sentence.answer;

      // Build a context-aware sentence: prior blanks filled with player's answers
      const targetSentence = buildSentenceForMask(sentence.text, masks, input.maskIndex, input.priorAnswers);
      const { tokens, source } = await getPredictions(targetSentence, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, correctAnswer]));

      const hint = combined[0] ?? correctAnswer;
      const revealChars = difficulty === "Easy" ? 3 : difficulty === "Medium" ? 2 : 1;
      const maskedHint = hint.slice(0, revealChars) + "*".repeat(Math.max(0, hint.length - revealChars));

      return {
        hint: maskedHint,
        fullHint: hint,
        pointPenalty: POINTS[difficulty].full - POINTS[difficulty].hint,
        pointsIfCorrect: POINTS[difficulty].hint,
        source,
      };
    }),

  /**
   * Classic mode: submit the single answer for a one-[MASK] sentence.
   */
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
      const masks: string[] = (() => {
        try { return JSON.parse(sentence.masks || "[]"); } catch { return [sentence.answer]; }
      })();
      const correctAnswer = masks[0] ?? sentence.answer;

      // Classic: only one [MASK], no prior context needed
      const targetSentence = buildSentenceForMask(sentence.text, masks, 0, []);
      const { tokens, source } = await getPredictions(targetSentence, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, correctAnswer]));

      const isCorrect = isMatch(input.playerAnswer, combined);
      const pointsEarned = isCorrect
        ? (input.hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full)
        : 0;

      await saveSessionAnswer({
        sessionId: input.sessionId,
        sentenceId: input.sentenceId,
        playerAnswer: input.playerAnswer,
        isCorrect,
        hintUsed: input.hintUsed,
        pointsEarned,
        maskIndex: 0,
      });

      await updateGameSession(input.sessionId, {
        correctAnswers: session.correctAnswers + (isCorrect ? 1 : 0),
        totalScore: session.totalScore + pointsEarned,
      });

      return { isCorrect, pointsEarned, correctAnswer, predictions: combined, source };
    }),

  /**
   * Consecutive mode: submit one blank at a time, conditioned on all prior
   * player answers. BERT sees the sentence with prior blanks filled by the
   * player's actual typed words (right or wrong), giving true context chaining.
   *
   * Call this once per blank. The frontend accumulates priorAnswers and
   * advances stepIndex after each call.
   */
  submitConsecutiveStep: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        sentenceId: z.number(),
        /** The player's answer for the current blank (stepIndex). */
        playerAnswer: z.string(),
        hintUsed: z.boolean(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
        /** 0-based index of the blank being answered right now. */
        stepIndex: z.number().int().min(0),
        /**
         * The player's typed answers for blanks 0 … stepIndex-1.
         * BERT uses these as left-context when predicting the current blank.
         */
        priorAnswers: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const session = await getGameSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });

      const difficulty = input.difficulty as Difficulty;
      const masks: string[] = (() => {
        try { return JSON.parse(sentence.masks || "[]"); } catch { return [sentence.answer]; }
      })();

      if (input.stepIndex >= masks.length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "stepIndex out of range." });

      const correctAnswer = masks[input.stepIndex]!;

      // Build the context-aware sentence:
      //   blanks 0 … stepIndex-1  → player's actual prior answers
      //   blank  stepIndex         → [MASK]  (what BERT predicts)
      //   blanks stepIndex+1 … N  → correct answers (right-context for grammar)
      const contextSentence = buildSentenceForMask(
        sentence.text,
        masks,
        input.stepIndex,
        input.priorAnswers
      );
      const { tokens, source } = await getPredictions(contextSentence, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, correctAnswer]));

      const isCorrect = isMatch(input.playerAnswer, combined);
      const pointsEarned = isCorrect
        ? (input.hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full)
        : 0;

      await saveSessionAnswer({
        sessionId: input.sessionId,
        sentenceId: input.sentenceId,
        playerAnswer: input.playerAnswer,
        isCorrect,
        hintUsed: input.hintUsed,
        pointsEarned,
        maskIndex: input.stepIndex,
      });

      await updateGameSession(input.sessionId, {
        correctAnswers: session.correctAnswers + (isCorrect ? 1 : 0),
        totalScore: session.totalScore + pointsEarned,
      });

      const isLastStep = input.stepIndex >= masks.length - 1;
      return {
        isCorrect,
        pointsEarned,
        correctAnswer,
        predictions: combined,
        source,
        totalSteps: masks.length,
        isLastStep,
        /** All correct answers — returned on last step for the summary panel */
        allCorrect: isLastStep ? masks : undefined,
      };
    }),

  /**
   * Consecutive mode hint: get a hint for the current blank, conditioned on
   * all prior player answers.
   */
  getConsecutiveHint: publicProcedure
    .input(
      z.object({
        sentenceId: z.number(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        bertModel: z.enum(BERT_MODEL_KEYS).optional().default("general"),
        stepIndex: z.number().int().min(0),
        priorAnswers: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const difficulty = input.difficulty as Difficulty;
      const masks: string[] = (() => {
        try { return JSON.parse(sentence.masks || "[]"); } catch { return [sentence.answer]; }
      })();
      const correctAnswer = masks[input.stepIndex] ?? sentence.answer;

      const contextSentence = buildSentenceForMask(
        sentence.text, masks, input.stepIndex, input.priorAnswers
      );
      const { tokens, source } = await getPredictions(contextSentence, input.bertModel, 5);
      const combined = Array.from(new Set([...tokens, correctAnswer]));

      const hint = combined[0] ?? correctAnswer;
      const revealChars = difficulty === "Easy" ? 3 : difficulty === "Medium" ? 2 : 1;
      const maskedHint = hint.slice(0, revealChars) + "*".repeat(Math.max(0, hint.length - revealChars));

      return {
        hint: maskedHint,
        fullHint: hint,
        pointPenalty: POINTS[difficulty].full - POINTS[difficulty].hint,
        pointsIfCorrect: POINTS[difficulty].hint,
        source,
      };
    }),

  /**
   * Submit all answers for a parallel-mode sentence at once.
   * Each answer in `playerAnswers` corresponds to the [MASK] at the same index.
   */
  submitParallelAnswers: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        sentenceId: z.number(),
        playerAnswers: z.array(z.string()),
        hintsUsed: z.array(z.boolean()),
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
      const masks: string[] = (() => {
        try { return JSON.parse(sentence.masks || "[]"); } catch { return [sentence.answer]; }
      })();

      const results: {
        maskIndex: number;
        playerAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
        pointsEarned: number;
        predictions: string[];
      }[] = [];

      let totalPointsEarned = 0;
      let totalCorrect = 0;

      for (let i = 0; i < masks.length; i++) {
        const correctAnswer = masks[i];
        const playerAnswer = input.playerAnswers[i] ?? "";
        const hintUsed = input.hintsUsed[i] ?? false;

        // Build a sentence with only this mask active
        const targetSentence = buildSentenceForMask(sentence.text, masks, i);
        const { tokens } = await getPredictions(targetSentence, input.bertModel, 5);
        const combined = Array.from(new Set([...tokens, correctAnswer]));

        const isCorrect = isMatch(playerAnswer, combined);
        const pointsEarned = isCorrect
          ? (hintUsed ? POINTS[difficulty].hint : POINTS[difficulty].full)
          : 0;

        await saveSessionAnswer({
          sessionId: input.sessionId,
          sentenceId: input.sentenceId,
          playerAnswer,
          isCorrect,
          hintUsed,
          pointsEarned,
          maskIndex: i,
        });

        results.push({ maskIndex: i, playerAnswer, correctAnswer, isCorrect, pointsEarned, predictions: combined });
        totalPointsEarned += pointsEarned;
        if (isCorrect) totalCorrect++;
      }

      await updateGameSession(input.sessionId, {
        correctAnswers: session.correctAnswers + totalCorrect,
        totalScore: session.totalScore + totalPointsEarned,
      });

      return {
        results,
        totalPointsEarned,
        totalCorrect,
        totalMasks: masks.length,
        allAnswers: masks,
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
        gameMode: session.gameMode,
      };
    }),
});
