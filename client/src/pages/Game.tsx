import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Lightbulb, ChevronRight, RotateCcw, Home, Trophy, Star, AlertCircle,
  List, Layers, AlignLeft,
} from "lucide-react";
import { toast } from "sonner";

type Difficulty = "Easy" | "Medium" | "Hard";
type GameMode = "classic" | "consecutive" | "parallel";
type Phase = "loading" | "question" | "feedback" | "gameover";

interface SentenceItem {
  id: number;
  text: string;
  difficulty: string;
  domain: string | null;
  gameMode?: string;
  maskCount?: number;
  /** Word count per [MASK] token — drives the _ _ _ placeholder rendering */
  maskWordCounts?: number[];
}

interface RoundResult {
  isCorrect: boolean;
  pointsEarned: number;
  correctAnswer: string;
  allAnswers?: string[];
  predictions: string[];
  // Parallel-specific
  parallelResults?: {
    maskIndex: number;
    playerAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    pointsEarned: number;
  }[];
  totalPointsEarned?: number;
  totalCorrect?: number;
}

const POINTS_MAP: Record<Difficulty, { full: number; hint: number }> = {
  Easy:   { full: 10, hint: 5 },
  Medium: { full: 20, hint: 10 },
  Hard:   { full: 30, hint: 15 },
};

const MODE_META: Record<GameMode, { label: string; icon: React.ReactNode; color: string }> = {
  classic:     { label: "Classic",     icon: <AlignLeft className="w-3.5 h-3.5" />, color: "text-sky-400 border-sky-400/40" },
  consecutive: { label: "Consecutive", icon: <List className="w-3.5 h-3.5" />,      color: "text-violet-400 border-violet-400/40" },
  parallel:    { label: "Parallel",    icon: <Layers className="w-3.5 h-3.5" />,    color: "text-fuchsia-400 border-fuchsia-400/40" },
};

// ── Render helpers ────────────────────────────────────────────────────────────

/**
 * Renders a blank placeholder with one underscore segment per word required.
 * Single-word answer → _   Two-word → _ _   Three-word → _ _ _  etc.
 */
function BlankPlaceholder({ wordCount = 1, dim = false }: { wordCount?: number; dim?: boolean }) {
  const count = Math.max(1, wordCount);
  return (
    <span
      className={["inline-flex items-center gap-[4px] mx-1 align-middle", dim ? "opacity-25" : ""].join(" ")}
      aria-label={`blank, ${count} word${count > 1 ? "s" : ""}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="inline-block h-[2px] w-[18px] rounded-full bg-[var(--color-primary)] align-middle" />
      ))}
    </span>
  );
}

/**
 * Render a sentence with all [MASK] tokens replaced by styled blanks.
 * In consecutive mode, only the active mask is shown as blank; earlier ones
 * show their correct answer, later ones show a dimmed placeholder.
 */
function renderSentenceConsecutive(
  text: string,
  activeMaskIndex: number,
  revealedAnswers: (string | null)[],
  maskWordCounts?: number[]
) {
  const parts = text.split("[MASK]");
  return (
    <span>
      {parts.map((part, i) => {
        if (i === parts.length - 1) return <span key={i}>{part}</span>;
        const answer = revealedAnswers[i];
        const isActive = i === activeMaskIndex;
        const isPast = i < activeMaskIndex;
        const wc = maskWordCounts?.[i] ?? 1;
        return (
          <span key={i}>
            {part}
            {isPast && answer ? (
              <span className="inline-block px-2 py-0.5 mx-0.5 rounded bg-correct/20 text-correct font-semibold text-[0.9em] border border-correct/30">
                {answer}
              </span>
            ) : isActive ? (
              <BlankPlaceholder wordCount={wc} />
            ) : (
              <BlankPlaceholder wordCount={wc} dim />
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Render a sentence for parallel mode: all [MASK] tokens shown as numbered blanks.
 */
function renderSentenceParallel(text: string, maskWordCounts?: number[]) {
  let idx = 0;
  const parts = text.split("[MASK]");
  return (
    <span>
      {parts.map((part, i) => {
        if (i === parts.length - 1) return <span key={i}>{part}</span>;
        const n = idx++;
        const wc = maskWordCounts?.[n] ?? 1;
        return (
          <span key={i}>
            {part}
            <span className="inline-flex items-center gap-0.5">
              <BlankPlaceholder wordCount={wc} />
              <sup className="text-[9px] text-[var(--color-primary)] font-bold leading-none -ml-1">{n + 1}</sup>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function renderSentenceClassic(text: string, wordCount = 1) {
  const parts = text.split("[MASK]");
  return (
    <span>
      {parts[0]}
      <BlankPlaceholder wordCount={wordCount} />
      {parts[1]}
    </span>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, maxScore, correct, total, current }: {
  score: number; maxScore: number; correct: number; total: number; current: number;
}) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div className="flex items-center gap-6 text-sm">
      <div className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
        <span className="font-medium text-[var(--color-foreground)]">{current}</span>
        <span>/</span>
        <span>{total}</span>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-1 font-semibold text-[var(--color-primary)]">
        <Star className="w-3.5 h-3.5" />
        {score}
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────────

function GameOver({ score, maxScore, correct, total, difficulty, gameMode, onReplay, onHome }: {
  score: number; maxScore: number; correct: number; total: number;
  difficulty: Difficulty; gameMode: GameMode; onReplay: () => void; onHome: () => void;
}) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const grade =
    pct >= 90 ? "Exceptional" : pct >= 70 ? "Great" : pct >= 50 ? "Good" :
    pct >= 30 ? "Fair" : "Keep Practising";
  const gradeColor =
    pct >= 90 ? "text-correct" : pct >= 70 ? "text-[var(--color-primary)]" :
    pct >= 50 ? "text-hint" : "text-[var(--color-muted-foreground)]";
  const modeMeta = MODE_META[gameMode];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute top-[20%] left-[30%] w-[35vw] h-[35vw] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.14 55) 0%, transparent 70%)" }}
        />
      </div>
      <div className="w-full max-w-md animate-scale-in">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] flex items-center justify-center">
            <Trophy className="w-9 h-9 text-[var(--color-primary)]" />
          </div>
        </div>
        <h1 className="font-display text-4xl font-bold text-center mb-2">Game Over</h1>
        <p className={`text-center text-xl font-semibold mb-8 ${gradeColor}`}>{grade}</p>

        <div className="glass rounded-2xl p-8 mb-6 space-y-5">
          <div className="flex flex-col items-center gap-1 pb-5 border-b border-[var(--color-border)]">
            <div className="text-5xl font-bold font-display text-gradient">{score}</div>
            <div className="text-[var(--color-muted-foreground)] text-sm">out of {maxScore} possible points</div>
            <div className="w-full h-2 rounded-full bg-[var(--color-border)] mt-3 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)] mt-1">{pct}% accuracy</div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-correct">{correct}</div>
              <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-incorrect">{total - correct}</div>
              <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Incorrect</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--color-foreground)]">{difficulty}</div>
              <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Difficulty</div>
            </div>
          </div>
          <div className="flex justify-center pt-1">
            <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-medium ${modeMeta.color}`}>
              {modeMeta.icon}
              {modeMeta.label} Mode
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onHome} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/30 transition-all duration-200 btn-press text-sm font-medium">
            <Home className="w-4 h-4" /> Home
          </button>
          <button onClick={onReplay} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-110 transition-all duration-200 btn-press text-sm font-semibold glow-primary">
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Game() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const difficulty = (params.get("difficulty") ?? "Easy") as Difficulty;
  const bertModel = (params.get("bert") ?? "general") as string;
  const gameMode = (params.get("mode") ?? "classic") as GameMode;

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [inputShake, setInputShake] = useState(false);

  // Classic / Consecutive state
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // Consecutive-specific: which mask index we're currently on
  const [maskIndex, setMaskIndex] = useState(0);
  const [revealedAnswers, setRevealedAnswers] = useState<(string | null)[]>([]);

  // Parallel-specific: one input per mask
  const [parallelAnswers, setParallelAnswers] = useState<string[]>([]);
  const [parallelHintsUsed, setParallelHintsUsed] = useState<boolean[]>([]);
  const [parallelHints, setParallelHints] = useState<(string | null)[]>([]);
  const [parallelHintLoading, setParallelHintLoading] = useState<boolean[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const startSession = trpc.game.startSession.useMutation();
  const submitAnswer = trpc.game.submitAnswer.useMutation();
  const submitParallel = trpc.game.submitParallelAnswers.useMutation();
  const getHint = trpc.game.getHint.useMutation();
  const finishSession = trpc.game.finishSession.useMutation();

  const bertModelKey = bertModel as "general" | "medical" | "clinical" | "science" | "finance" | "legal";
  const currentSentence = sentences[currentIndex] ?? null;
  const totalQuestions = sentences.length;
  const maskCount = currentSentence?.maskCount ?? 1;

  // ── Start session ──────────────────────────────────────────────────────────
  useEffect(() => {
    startSession.mutate(
      { difficulty, bertModel: bertModelKey, gameMode },
      {
        onSuccess(data) {
          setSessionId(data.sessionId);
          setSentences(data.sentences as SentenceItem[]);
          setMaxScore(data.maxScore);
          setPhase("question");
        },
        onError() {
          toast.error("Failed to start game. Please try again.");
          navigate("/");
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset per-question state when question changes ─────────────────────────
  // Reset all per-sentence state whenever the sentence index changes.
  // Importantly, we do NOT include `phase` here so that advancing maskIndex
  // within a consecutive sentence (which stays in "question" phase) does NOT
  // trigger a reset.
  useEffect(() => {
    setPlayerAnswer("");
    setHintUsed(false);
    setHintText(null);
    setMaskIndex(0);
    setRevealedAnswers([]);
    const mc = sentences[currentIndex]?.maskCount ?? 1;
    setParallelAnswers(Array(mc).fill(""));
    setParallelHintsUsed(Array(mc).fill(false));
    setParallelHints(Array(mc).fill(null));
    setParallelHintLoading(Array(mc).fill(false));
    setTimeout(() => inputRef.current?.focus(), 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Advance to next sentence or game over ─────────────────────────────────
  const handleNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= totalQuestions) {
      if (sessionId) finishSession.mutate({ sessionId });
      setPhase("gameover");
    } else {
      // Advance to the next sentence; the currentIndex useEffect resets all
      // per-sentence state (maskIndex, revealedAnswers, inputs, hints).
      setCurrentIndex(nextIndex);
      setRoundResult(null);
      setPhase("question");
    }
  }, [currentIndex, totalQuestions, sessionId, finishSession]);

  // ── Classic / Consecutive: single-answer submit ────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!currentSentence || !sessionId || !playerAnswer.trim()) {
      setInputShake(true);
      setTimeout(() => setInputShake(false), 500);
      return;
    }

    submitAnswer.mutate(
      {
        sessionId,
        sentenceId: currentSentence.id,
        playerAnswer: playerAnswer.trim(),
        hintUsed,
        difficulty,
        bertModel: bertModelKey,
        maskIndex,
      },
      {
        onSuccess(data) {
          if (gameMode === "consecutive") {
            // Reveal this blank's correct answer inline in the sentence
            setRevealedAnswers((prev) => {
              const next = [...prev];
              next[maskIndex] = data.correctAnswer;
              return next;
            });
            setScore((s) => s + data.pointsEarned);
            if (data.isCorrect) setCorrect((c) => c + 1);

            if (!data.isLastMask) {
              // More blanks remain in this sentence — stay on same sentence,
              // advance to the next blank only
              setMaskIndex((m) => m + 1);
              setPlayerAnswer("");
              setHintUsed(false);
              setHintText(null);
              toast[data.isCorrect ? "success" : "error"](
                data.isCorrect
                  ? `+${data.pointsEarned} pts — Blank ${maskIndex + 1} correct!`
                  : `Blank ${maskIndex + 1}: the answer was “${data.correctAnswer}”`,
                { duration: 2500 }
              );
              // Remain in "question" phase — do NOT advance sentence here
            } else {
              // All blanks in this sentence done — show full sentence feedback
              setRoundResult({
                isCorrect: data.isCorrect,
                pointsEarned: data.pointsEarned,
                correctAnswer: data.correctAnswer,
                allAnswers: data.allAnswers,
                predictions: data.predictions,
              });
              setPhase("feedback");
            }
          } else {
            // Classic
            setRoundResult({
              isCorrect: data.isCorrect,
              pointsEarned: data.pointsEarned,
              correctAnswer: data.correctAnswer,
              predictions: data.predictions,
            });
            if (data.isCorrect) {
              setScore((s) => s + data.pointsEarned);
              setCorrect((c) => c + 1);
            }
            setPhase("feedback");
          }
        },
        onError() { toast.error("Failed to submit answer."); },
      }
    );
  }, [currentSentence, sessionId, playerAnswer, hintUsed, difficulty, submitAnswer, gameMode, maskIndex]);

  // ── Parallel: submit all answers at once ──────────────────────────────────
  const handleParallelSubmit = useCallback(() => {
    if (!currentSentence || !sessionId) return;
    const allFilled = parallelAnswers.every((a) => a.trim().length > 0);
    if (!allFilled) {
      setInputShake(true);
      setTimeout(() => setInputShake(false), 500);
      toast.error("Please fill in all blanks before submitting.");
      return;
    }

    submitParallel.mutate(
      {
        sessionId,
        sentenceId: currentSentence.id,
        playerAnswers: parallelAnswers.map((a) => a.trim()),
        hintsUsed: parallelHintsUsed,
        difficulty,
        bertModel: bertModelKey,
      },
      {
        onSuccess(data) {
          setScore((s) => s + data.totalPointsEarned);
          setCorrect((c) => c + data.totalCorrect);
          setRoundResult({
            isCorrect: data.totalCorrect === data.totalMasks,
            pointsEarned: data.totalPointsEarned,
            correctAnswer: data.allAnswers?.[0] ?? "",
            allAnswers: data.allAnswers,
            predictions: [],
            parallelResults: data.results,
            totalPointsEarned: data.totalPointsEarned,
            totalCorrect: data.totalCorrect,
          });
          setPhase("feedback");
        },
        onError() { toast.error("Failed to submit answers."); },
      }
    );
  }, [currentSentence, sessionId, parallelAnswers, parallelHintsUsed, difficulty, submitParallel]);

  // ── Re-focus input when maskIndex advances in consecutive mode ────────────────
  useEffect(() => {
    if (gameMode === "consecutive" && phase === "question") {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [maskIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hint: classic / consecutive ───────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (!currentSentence || hintUsed || hintLoading) return;
    setHintLoading(true);
    getHint.mutate(
      { sentenceId: currentSentence.id, difficulty, bertModel: bertModelKey, maskIndex },
      {
        onSuccess(data) {
          setHintText(data.hint);
          setHintUsed(true);
          setHintLoading(false);
        },
        onError() { toast.error("Could not load hint."); setHintLoading(false); },
      }
    );
  }, [currentSentence, difficulty, getHint, hintUsed, hintLoading, maskIndex]);

  // ── Hint: parallel (per-mask) ─────────────────────────────────────────────
  const handleParallelHint = useCallback((idx: number) => {
    if (!currentSentence || parallelHintsUsed[idx] || parallelHintLoading[idx]) return;
    setParallelHintLoading((prev) => { const n = [...prev]; n[idx] = true; return n; });
    getHint.mutate(
      { sentenceId: currentSentence.id, difficulty, bertModel: bertModelKey, maskIndex: idx },
      {
        onSuccess(data) {
          setParallelHints((prev) => { const n = [...prev]; n[idx] = data.hint; return n; });
          setParallelHintsUsed((prev) => { const n = [...prev]; n[idx] = true; return n; });
          setParallelHintLoading((prev) => { const n = [...prev]; n[idx] = false; return n; });
        },
        onError() {
          toast.error("Could not load hint.");
          setParallelHintLoading((prev) => { const n = [...prev]; n[idx] = false; return n; });
        },
      }
    );
  }, [currentSentence, difficulty, getHint, parallelHintsUsed, parallelHintLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (phase === "question") {
        if (gameMode === "parallel") handleParallelSubmit();
        else handleSubmit();
      } else if (phase === "feedback") handleNext();
    }
  };

  const handleReplay = () => navigate(`/game?difficulty=${difficulty}&bert=${bertModel}&mode=${gameMode}`);
  const handleHome = () => navigate("/");

  const pts = POINTS_MAP[difficulty];
  const modeMeta = MODE_META[gameMode];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
          <p className="text-[var(--color-muted-foreground)] text-sm">Preparing your game…</p>
        </div>
      </div>
    );
  }

  // ── Game Over ──────────────────────────────────────────────────────────────
  if (phase === "gameover") {
    return (
      <GameOver
        score={score} maxScore={maxScore} correct={correct} total={totalQuestions}
        difficulty={difficulty} gameMode={gameMode} onReplay={handleReplay} onHome={handleHome}
      />
    );
  }

  // ── Question / Feedback ────────────────────────────────────────────────────
  const isFeedback = phase === "feedback";

  return (
    <div className="min-h-screen flex flex-col px-4 py-8" onKeyDown={handleKeyDown}>
      {/* Top bar */}
      <div className="w-full max-w-xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-3">
          <button onClick={handleHome} className="flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-sm">
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium px-3 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted-foreground)]">
              {difficulty}
            </div>
            <div className={`text-xs font-medium px-3 py-1 rounded-full border flex items-center gap-1 ${modeMeta.color}`}>
              {modeMeta.icon}
              {modeMeta.label}
            </div>
            <div className="text-xs font-medium px-3 py-1 rounded-full border border-[var(--color-primary)]/40 text-[var(--color-primary)] capitalize">
              {bertModel}
            </div>
          </div>
        </div>
        <ScoreBar score={score} maxScore={maxScore} correct={correct} total={totalQuestions} current={currentIndex + 1} />
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-xl">
          {currentSentence && (
            <div key={`${currentIndex}-${maskIndex}`} className="glass rounded-2xl p-8 sm:p-10 animate-fade-in-up">
              {/* Domain badge */}
              {currentSentence.domain && (
                <div className="text-xs text-[var(--color-muted-foreground)] uppercase tracking-widest mb-5">
                  {currentSentence.domain}
                </div>
              )}

              {/* Consecutive progress indicator */}
              {gameMode === "consecutive" && maskCount > 1 && (
                <div className="flex items-center gap-1.5 mb-4">
                  {Array.from({ length: maskCount }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i < maskIndex ? "bg-correct" :
                        i === maskIndex ? "bg-[var(--color-primary)]" :
                        "bg-[var(--color-border)]"
                      }`}
                    />
                  ))}
                  <span className="text-xs text-[var(--color-muted-foreground)] ml-1 flex-shrink-0">
                    Blank {maskIndex + 1}/{maskCount}
                  </span>
                </div>
              )}

              {/* Sentence */}
              <p className="font-display text-xl sm:text-2xl leading-relaxed mb-8 text-[var(--color-foreground)]">
                {gameMode === "consecutive"
                  ? renderSentenceConsecutive(currentSentence.text, maskIndex, revealedAnswers, currentSentence.maskWordCounts)
                  : gameMode === "parallel"
                  ? renderSentenceParallel(currentSentence.text, currentSentence.maskWordCounts)
                  : renderSentenceClassic(currentSentence.text, currentSentence.maskWordCounts?.[0] ?? 1)}
              </p>

              {/* ── CLASSIC / CONSECUTIVE input ───────────────────────────── */}
              {(gameMode === "classic" || gameMode === "consecutive") && !isFeedback && (
                <>
                  {hintText && (
                    <div className="flex items-center gap-2 text-hint text-sm mb-4 animate-fade-in">
                      <Lightbulb className="w-4 h-4 flex-shrink-0" />
                      <span>Hint: <strong>{hintText}</strong></span>
                    </div>
                  )}
                  <div className="flex gap-3 mb-4">
                    <input
                      ref={inputRef}
                      type="text"
                      value={playerAnswer}
                      onChange={(e) => setPlayerAnswer(e.target.value)}
                      placeholder={gameMode === "consecutive" ? `Answer for blank ${maskIndex + 1}…` : "Type your answer…"}
                      disabled={submitAnswer.isPending}
                      className={[
                        "flex-1 px-4 py-3 rounded-xl bg-[var(--color-input)] border border-[var(--color-border)]",
                        "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
                        "focus:outline-none focus:border-[var(--color-ring)] focus:ring-1 focus:ring-[var(--color-ring)]",
                        "transition-all duration-200 text-sm",
                        inputShake ? "animate-shake" : "",
                      ].join(" ")}
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={submitAnswer.isPending || !playerAnswer.trim()}
                      className={[
                        "px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 btn-press",
                        "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
                        playerAnswer.trim() && !submitAnswer.isPending
                          ? "opacity-100 hover:brightness-110"
                          : "opacity-40 cursor-not-allowed",
                      ].join(" ")}
                    >
                      {submitAnswer.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Checking
                        </span>
                      ) : gameMode === "consecutive" && maskIndex < maskCount - 1 ? "Next Blank" : "Submit"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleHint}
                      disabled={hintUsed || hintLoading}
                      className={[
                        "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all duration-200 btn-press",
                        hintUsed
                          ? "border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-50 cursor-not-allowed"
                          : "border-[var(--color-hint)]/40 text-hint hover:border-[var(--color-hint)]/70 hover:bg-[var(--color-hint)]/5",
                      ].join(" ")}
                    >
                      {hintLoading ? <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                      Hint
                    </button>
                    {!hintUsed && (
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        Costs {pts.full - pts.hint} pts — earns {pts.hint} pts if correct
                      </span>
                    )}
                  </div>
                </>
              )}

              {/* ── PARALLEL inputs ───────────────────────────────────────── */}
              {gameMode === "parallel" && !isFeedback && (
                <div className="space-y-4 mb-2">
                  {Array.from({ length: maskCount }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">
                          Blank {i + 1}
                        </label>
                        <div className="flex items-center gap-2">
                          {parallelHints[i] && (
                            <span className="text-xs text-hint flex items-center gap-1 animate-fade-in">
                              <Lightbulb className="w-3 h-3" />
                              {parallelHints[i]}
                            </span>
                          )}
                          <button
                            onClick={() => handleParallelHint(i)}
                            disabled={parallelHintsUsed[i] || parallelHintLoading[i]}
                            className={[
                              "flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-all duration-200",
                              parallelHintsUsed[i]
                                ? "border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-40 cursor-not-allowed"
                                : "border-[var(--color-hint)]/40 text-hint hover:border-[var(--color-hint)]/70",
                            ].join(" ")}
                          >
                            {parallelHintLoading[i]
                              ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              : <Lightbulb className="w-3 h-3" />}
                            Hint
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={parallelAnswers[i] ?? ""}
                        onChange={(e) => {
                          const next = [...parallelAnswers];
                          next[i] = e.target.value;
                          setParallelAnswers(next);
                        }}
                        placeholder={`Answer for blank ${i + 1}…`}
                        disabled={submitParallel.isPending}
                        className={[
                          "w-full px-4 py-3 rounded-xl bg-[var(--color-input)] border border-[var(--color-border)]",
                          "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
                          "focus:outline-none focus:border-[var(--color-ring)] focus:ring-1 focus:ring-[var(--color-ring)]",
                          "transition-all duration-200 text-sm",
                          inputShake && !parallelAnswers[i]?.trim() ? "animate-shake border-incorrect" : "",
                        ].join(" ")}
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
                      Each Hint costs {pts.full - pts.hint} pts per blank — earns {pts.hint} pts if correct
                    </p>
                    <button
                      onClick={handleParallelSubmit}
                      disabled={submitParallel.isPending || parallelAnswers.some((a) => !a.trim())}
                      className={[
                        "w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 btn-press",
                        "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
                        !submitParallel.isPending && parallelAnswers.every((a) => a.trim())
                          ? "opacity-100 hover:brightness-110"
                          : "opacity-40 cursor-not-allowed",
                      ].join(" ")}
                    >
                      {submitParallel.isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Checking all blanks…
                        </span>
                      ) : "Submit All Answers"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Feedback panel ────────────────────────────────────────── */}
              {isFeedback && roundResult && (
                <div className={[
                  "rounded-xl p-5 border animate-scale-in",
                  roundResult.isCorrect
                    ? "bg-correct border-correct animate-pulse-glow"
                    : "bg-incorrect border-incorrect",
                ].join(" ")}>

                  {/* Classic / Consecutive feedback */}
                  {gameMode !== "parallel" && (
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className={`font-semibold text-base mb-1 ${roundResult.isCorrect ? "text-correct" : "text-incorrect"}`}>
                          {roundResult.isCorrect ? "Correct!" : "Incorrect"}
                        </div>
                        {!roundResult.isCorrect && (
                          <div className="text-sm text-[var(--color-muted-foreground)]">
                            The answer was{" "}
                            <strong className="text-[var(--color-foreground)]">{roundResult.correctAnswer}</strong>
                          </div>
                        )}
                        {gameMode === "consecutive" && roundResult.allAnswers && roundResult.allAnswers.length > 1 && (
                          <div className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                            All answers:{" "}
                            {roundResult.allAnswers.map((a, i) => (
                              <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-[var(--color-card)] border border-[var(--color-border)] font-medium text-[var(--color-foreground)]">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-2xl font-bold font-display ${roundResult.isCorrect ? "text-correct" : "text-[var(--color-muted-foreground)]"}`}>
                          {roundResult.isCorrect ? `+${roundResult.pointsEarned}` : "+0"}
                        </div>
                        <div className="text-xs text-[var(--color-muted-foreground)]">points</div>
                      </div>
                    </div>
                  )}

                  {/* Parallel feedback: per-blank breakdown */}
                  {gameMode === "parallel" && roundResult.parallelResults && (
                    <div className="mb-3">
                      <div className={`font-semibold text-base mb-3 ${roundResult.isCorrect ? "text-correct" : "text-incorrect"}`}>
                        {roundResult.totalCorrect}/{roundResult.parallelResults.length} blanks correct
                      </div>
                      <div className="space-y-2">
                        {roundResult.parallelResults.map((r) => (
                          <div key={r.maskIndex} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg border ${
                            r.isCorrect ? "bg-correct/10 border-correct/30" : "bg-incorrect/10 border-incorrect/30"
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${r.isCorrect ? "text-correct" : "text-incorrect"}`}>
                                Blank {r.maskIndex + 1}
                              </span>
                              <span className="text-[var(--color-muted-foreground)]">
                                You: <strong className="text-[var(--color-foreground)]">{r.playerAnswer || "—"}</strong>
                              </span>
                              {!r.isCorrect && (
                                <span className="text-[var(--color-muted-foreground)]">
                                  → <strong className="text-[var(--color-foreground)]">{r.correctAnswer}</strong>
                                </span>
                              )}
                            </div>
                            <span className={`font-bold ${r.isCorrect ? "text-correct" : "text-[var(--color-muted-foreground)]"}`}>
                              {r.isCorrect ? `+${r.pointsEarned}` : "+0"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end mt-2">
                        <span className="text-sm font-bold text-[var(--color-primary)]">
                          Total: +{roundResult.totalPointsEarned} pts
                        </span>
                      </div>
                    </div>
                  )}

                  {hintUsed && roundResult.isCorrect && gameMode !== "parallel" && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] mb-3">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Hint used — half points awarded
                    </div>
                  )}

                  <button
                    onClick={handleNext}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)] text-sm font-medium hover:bg-[var(--color-accent)] transition-all duration-200 btn-press mt-1"
                  >
                    {currentIndex + 1 >= totalQuestions ? "See Results" : "Next Question"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
