import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  createGameSession,
  getAnsweredSentenceIds,
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

// ── LLM fill-mask helper ─────────────────────────────────────────────────────

async function getPredictions(sentence: string, topN = 5): Promise<string[]> {
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
            predictions: {
              type: "array",
              items: { type: "string" },
            },
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

// ── Normalise for comparison ─────────────────────────────────────────────────

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "");
}

function isMatch(playerAnswer: string, candidates: string[]): boolean {
  const p = normalise(playerAnswer);
  return candidates.some((c) => normalise(c) === p);
}

// ── Router ───────────────────────────────────────────────────────────────────

export const gameRouter = router({
  /** Start a new game session and return the first sentence */
  startSession: publicProcedure
    .input(z.object({ difficulty: z.enum(["Easy", "Medium", "Hard"]) }))
    .mutation(async ({ input }) => {
      const difficulty = input.difficulty as Difficulty;
      const allSentences = await getSentencesByDifficulty(difficulty, QUESTIONS_PER_GAME);
      if (allSentences.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No sentences found for this difficulty." });

      const sessionId = await createGameSession(difficulty);
      const maxScore = allSentences.length * POINTS[difficulty].full;
      await updateGameSession(sessionId, {
        totalQuestions: allSentences.length,
        maxScore,
      });

      // Store sentence order in session (we'll re-derive from DB order)
      return {
        sessionId,
        totalQuestions: allSentences.length,
        maxScore,
        sentences: allSentences.map((s) => ({ id: s.id, text: s.text, difficulty: s.difficulty, domain: s.domain })),
      };
    }),

  /** Get LLM predictions for a sentence (used for hint + evaluation) */
  getPredictions: publicProcedure
    .input(z.object({ sentenceId: z.number() }))
    .query(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });
      const predictions = await getPredictions(sentence.text, 5);
      // Always include the canonical answer as a fallback
      const combined = Array.from(new Set([...predictions, sentence.answer]));
      return { predictions: combined };
    }),

  /** Get a single hint word (first prediction) */
  getHint: publicProcedure
    .input(z.object({ sentenceId: z.number(), difficulty: z.enum(["Easy", "Medium", "Hard"]) }))
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const difficulty = input.difficulty as Difficulty;
      const predictions = await getPredictions(sentence.text, 5);
      const combined = Array.from(new Set([...predictions, sentence.answer]));

      // For Easy: reveal 2 chars, Medium: reveal 1 char, Hard: reveal first letter only
      const hint = combined[0] ?? sentence.answer;
      const revealChars = difficulty === "Easy" ? 3 : difficulty === "Medium" ? 2 : 1;
      const maskedHint = hint.slice(0, revealChars) + "*".repeat(Math.max(0, hint.length - revealChars));

      return {
        hint: maskedHint,
        fullHint: hint,
        pointPenalty: POINTS[difficulty].full - POINTS[difficulty].hint,
        pointsIfCorrect: POINTS[difficulty].hint,
      };
    }),

  /** Submit an answer for a round */
  submitAnswer: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        sentenceId: z.number(),
        playerAnswer: z.string(),
        hintUsed: z.boolean(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
      })
    )
    .mutation(async ({ input }) => {
      const sentence = await getSentenceById(input.sentenceId);
      if (!sentence) throw new TRPCError({ code: "NOT_FOUND" });

      const session = await getGameSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });

      const difficulty = input.difficulty as Difficulty;
      const predictions = await getPredictions(sentence.text, 5);
      const combined = Array.from(new Set([...predictions, sentence.answer]));

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

      // Update session totals
      await updateGameSession(input.sessionId, {
        correctAnswers: session.correctAnswers + (isCorrect ? 1 : 0),
        totalScore: session.totalScore + pointsEarned,
      });

      return {
        isCorrect,
        pointsEarned,
        correctAnswer: sentence.answer,
        predictions: combined,
      };
    }),

  /** Finalise the session (called when all questions answered) */
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
