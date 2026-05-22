import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Lightbulb, ChevronRight, RotateCcw, Home, Trophy, Star, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Difficulty = "Easy" | "Medium" | "Hard";
type Phase = "loading" | "question" | "feedback" | "gameover";

interface SentenceItem {
  id: number;
  text: string;
  difficulty: string;
  domain: string | null;
}

interface RoundResult {
  isCorrect: boolean;
  pointsEarned: number;
  correctAnswer: string;
  predictions: string[];
}

const POINTS_MAP: Record<Difficulty, { full: number; hint: number }> = {
  Easy:   { full: 10, hint: 5 },
  Medium: { full: 20, hint: 10 },
  Hard:   { full: 30, hint: 15 },
};

function renderSentence(text: string) {
  const parts = text.split("[MASK]");
  return (
    <span>
      {parts[0]}
      <span className="blank-line" aria-label="blank" />
      {parts[1]}
    </span>
  );
}

function ScoreBar({
  score,
  maxScore,
  correct,
  total,
  current,
}: {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  current: number;
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

function GameOver({
  score,
  maxScore,
  correct,
  total,
  difficulty,
  onReplay,
  onHome,
}: {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  difficulty: Difficulty;
  onReplay: () => void;
  onHome: () => void;
}) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const grade =
    pct >= 90 ? "Exceptional" :
    pct >= 70 ? "Great" :
    pct >= 50 ? "Good" :
    pct >= 30 ? "Fair" : "Keep Practising";

  const gradeColor =
    pct >= 90 ? "text-correct" :
    pct >= 70 ? "text-[var(--color-primary)]" :
    pct >= 50 ? "text-hint" :
    "text-[var(--color-muted-foreground)]";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Ambient */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute top-[20%] left-[30%] w-[35vw] h-[35vw] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.14 55) 0%, transparent 70%)" }}
        />
      </div>

      <div className="w-full max-w-md animate-scale-in">
        {/* Trophy icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] flex items-center justify-center">
            <Trophy className="w-9 h-9 text-[var(--color-primary)]" />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-display text-4xl font-bold text-center mb-2">Game Over</h1>
        <p className={`text-center text-xl font-semibold mb-8 ${gradeColor}`}>{grade}</p>

        {/* Stats card */}
        <div className="glass rounded-2xl p-8 mb-6 space-y-5">
          {/* Score ring */}
          <div className="flex flex-col items-center gap-1 pb-5 border-b border-[var(--color-border)]">
            <div className="text-5xl font-bold font-display text-gradient">{score}</div>
            <div className="text-[var(--color-muted-foreground)] text-sm">out of {maxScore} possible points</div>
            <div className="w-full h-2 rounded-full bg-[var(--color-border)] mt-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)] mt-1">{pct}% accuracy</div>
          </div>

          {/* Breakdown */}
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
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onHome}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/30 transition-all duration-200 btn-press text-sm font-medium"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
          <button
            onClick={onReplay}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-110 transition-all duration-200 btn-press text-sm font-semibold glow-primary"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Game() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const difficulty = (params.get("difficulty") ?? "Easy") as Difficulty;
  const bertModel = (params.get("bert") ?? "general") as string;

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [inputShake, setInputShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startSession = trpc.game.startSession.useMutation();
  const submitAnswer = trpc.game.submitAnswer.useMutation();
  const getHint = trpc.game.getHint.useMutation();
  const finishSession = trpc.game.finishSession.useMutation();

  const currentSentence = sentences[currentIndex] ?? null;
  const totalQuestions = sentences.length;

  // Start session on mount
  useEffect(() => {
    startSession.mutate(
      { difficulty, bertModel: bertModel as "general" | "medical" | "clinical" | "science" | "finance" | "legal" },
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

  // Focus input when question phase starts
  useEffect(() => {
    if (phase === "question") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase, currentIndex]);

  const handleHint = useCallback(async () => {
    if (!currentSentence || hintUsed || hintLoading) return;
    setHintLoading(true);
    getHint.mutate(
      { sentenceId: currentSentence.id, difficulty, bertModel: bertModel as "general" | "medical" | "clinical" | "science" | "finance" | "legal" },
      {
        onSuccess(data) {
          setHintText(data.hint);
          setHintUsed(true);
          setHintLoading(false);
        },
        onError() {
          toast.error("Could not load hint.");
          setHintLoading(false);
        },
      }
    );
  }, [currentSentence, difficulty, getHint, hintUsed, hintLoading]);

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
        bertModel: bertModel as "general" | "medical" | "clinical" | "science" | "finance" | "legal",
      },
      {
        onSuccess(data) {
          setRoundResult(data);
          if (data.isCorrect) {
            setScore((s) => s + data.pointsEarned);
            setCorrect((c) => c + 1);
          }
          setPhase("feedback");
        },
        onError() {
          toast.error("Failed to submit answer.");
        },
      }
    );
  }, [currentSentence, sessionId, playerAnswer, hintUsed, difficulty, submitAnswer]);

  const handleNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= totalQuestions) {
      // Game over
      if (sessionId) {
        finishSession.mutate({ sessionId });
      }
      setPhase("gameover");
    } else {
      setCurrentIndex(nextIndex);
      setPlayerAnswer("");
      setHintUsed(false);
      setHintText(null);
      setRoundResult(null);
      setPhase("question");
    }
  }, [currentIndex, totalQuestions, sessionId, finishSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (phase === "question") handleSubmit();
      else if (phase === "feedback") handleNext();
    }
  };

  const handleReplay = () => navigate(`/game?difficulty=${difficulty}&bert=${bertModel}`);
  const handleHome = () => navigate("/");

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
        score={score}
        maxScore={maxScore}
        correct={correct}
        total={totalQuestions}
        difficulty={difficulty}
        onReplay={handleReplay}
        onHome={handleHome}
      />
    );
  }

  // ── Question / Feedback ────────────────────────────────────────────────────
  const isFeedback = phase === "feedback";
  const pts = POINTS_MAP[difficulty];

  return (
    <div className="min-h-screen flex flex-col px-4 py-8">
      {/* Top bar */}
      <div className="w-full max-w-xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={handleHome}
            className="flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-sm"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium px-3 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted-foreground)]">
              {difficulty}
            </div>
            <div className="text-xs font-medium px-3 py-1 rounded-full border border-[var(--color-primary)]/40 text-[var(--color-primary)] capitalize">
              {bertModel}
            </div>
          </div>
        </div>
        <ScoreBar
          score={score}
          maxScore={maxScore}
          correct={correct}
          total={totalQuestions}
          current={currentIndex + 1}
        />
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-xl">
          {currentSentence && (
            <div
              key={currentIndex}
              className="glass rounded-2xl p-8 sm:p-10 animate-fade-in-up"
            >
              {/* Domain badge */}
              {currentSentence.domain && (
                <div className="text-xs text-[var(--color-muted-foreground)] uppercase tracking-widest mb-5">
                  {currentSentence.domain}
                </div>
              )}

              {/* Sentence */}
              <p className="font-display text-xl sm:text-2xl leading-relaxed mb-8 text-[var(--color-foreground)]">
                {renderSentence(currentSentence.text)}
              </p>

              {/* Hint area */}
              {hintText && (
                <div className="flex items-center gap-2 text-hint text-sm mb-4 animate-fade-in">
                  <Lightbulb className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Hint: <strong>{hintText}</strong>
                  </span>
                </div>
              )}

              {/* Input row */}
              {!isFeedback && (
                <div className="flex gap-3 mb-4">
                  <input
                    ref={inputRef}
                    type="text"
                    value={playerAnswer}
                    onChange={(e) => setPlayerAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer…"
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
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              )}

              {/* Hint button */}
              {!isFeedback && (
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
                    {hintLoading ? (
                      <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Lightbulb className="w-3.5 h-3.5" />
                    )}
                    Hint
                  </button>
                  {!hintUsed && (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      Costs {pts.full - pts.hint} pts — earns {pts.hint} pts if correct
                    </span>
                  )}
                </div>
              )}

              {/* Feedback panel */}
              {isFeedback && roundResult && (
                <div
                  className={[
                    "rounded-xl p-5 border animate-scale-in",
                    roundResult.isCorrect
                      ? "bg-correct border-correct animate-pulse-glow"
                      : "bg-incorrect border-incorrect",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div
                        className={`font-semibold text-base mb-1 ${
                          roundResult.isCorrect ? "text-correct" : "text-incorrect"
                        }`}
                      >
                        {roundResult.isCorrect ? "Correct!" : "Incorrect"}
                      </div>
                      {!roundResult.isCorrect && (
                        <div className="text-sm text-[var(--color-muted-foreground)]">
                          The answer was{" "}
                          <strong className="text-[var(--color-foreground)]">
                            {roundResult.correctAnswer}
                          </strong>
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className={`text-2xl font-bold font-display ${
                          roundResult.isCorrect
                            ? "text-correct"
                            : "text-[var(--color-muted-foreground)]"
                        }`}
                      >
                        {roundResult.isCorrect ? `+${roundResult.pointsEarned}` : "+0"}
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">points</div>
                    </div>
                  </div>

                  {hintUsed && roundResult.isCorrect && (
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
