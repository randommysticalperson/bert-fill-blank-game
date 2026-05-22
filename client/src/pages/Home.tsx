import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, BookOpen, Zap, Trophy, FlaskConical, Scale, TrendingUp, Stethoscope, Cpu, CheckCircle2, XCircle, Loader2, List, Layers, AlignLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Difficulty = "Easy" | "Medium" | "Hard";
type BertModel = "general" | "medical" | "clinical" | "science" | "finance" | "legal";
type GameMode = "classic" | "consecutive" | "parallel";

const GAME_MODES: {
  key: GameMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  color: string;
  border: string;
}[] = [
  {
    key: "classic",
    label: "Classic",
    description: "One blank per sentence. The original fill-in-the-blank experience.",
    icon: <AlignLeft className="w-5 h-5" />,
    badge: "1 blank",
    color: "text-sky-400",
    border: "hover:border-sky-400/60",
  },
  {
    key: "consecutive",
    label: "Consecutive",
    description: "Multiple blanks revealed one at a time in order. Each answer unlocks the next.",
    icon: <List className="w-5 h-5" />,
    badge: "2+ blanks in order",
    color: "text-violet-400",
    border: "hover:border-violet-400/60",
  },
  {
    key: "parallel",
    label: "Parallel",
    description: "All blanks shown at once. Fill every gap independently before submitting.",
    icon: <Layers className="w-5 h-5" />,
    badge: "2+ blanks at once",
    color: "text-fuchsia-400",
    border: "hover:border-fuchsia-400/60",
  },
];

const DIFFICULTIES: {
  key: Difficulty;
  label: string;
  description: string;
  icon: React.ReactNode;
  points: string;
  color: string;
  border: string;
}[] = [
  {
    key: "Easy",
    label: "Easy",
    description: "Common knowledge, everyday vocabulary. Perfect for a warm-up.",
    icon: <BookOpen className="w-6 h-6" />,
    points: "10 pts / question",
    color: "text-emerald-400",
    border: "hover:border-emerald-400/60",
  },
  {
    key: "Medium",
    label: "Medium",
    description: "Science, history, and literature. A satisfying challenge.",
    icon: <Zap className="w-6 h-6" />,
    points: "20 pts / question",
    color: "text-amber-400",
    border: "hover:border-amber-400/60",
  },
  {
    key: "Hard",
    label: "Hard",
    description: "Advanced concepts across philosophy, physics, and more.",
    icon: <Trophy className="w-6 h-6" />,
    points: "30 pts / question",
    color: "text-rose-400",
    border: "hover:border-rose-400/60",
  },
];

const BERT_MODELS: {
  key: BertModel;
  label: string;
  description: string;
  icon: React.ReactNode;
  hfId: string;
}[] = [
  {
    key: "general",
    label: "General",
    description: "Google BERT — broad everyday language",
    icon: <Cpu className="w-4 h-4" />,
    hfId: "bert-base-uncased",
  },
  {
    key: "medical",
    label: "Medical",
    description: "BiomedBERT — PubMed abstracts (Microsoft)",
    icon: <Stethoscope className="w-4 h-4" />,
    hfId: "BiomedNLP-BiomedBERT",
  },
  {
    key: "clinical",
    label: "Clinical",
    description: "Bio_ClinicalBERT — MIMIC-III clinical notes",
    icon: <FlaskConical className="w-4 h-4" />,
    hfId: "Bio_ClinicalBERT",
  },
  {
    key: "science",
    label: "Science",
    description: "SciBERT — 1.14M scientific papers (Allen AI)",
    icon: <FlaskConical className="w-4 h-4" />,
    hfId: "scibert_scivocab_uncased",
  },
  {
    key: "finance",
    label: "Finance",
    description: "FinBERT — 4.9B tokens of financial text",
    icon: <TrendingUp className="w-4 h-4" />,
    hfId: "finbert-pretrain",
  },
  {
    key: "legal",
    label: "Legal",
    description: "LegalBERT — EU/UK legislation & US court cases",
    icon: <Scale className="w-4 h-4" />,
    hfId: "legal-bert-base-uncased",
  },
];

function SidecarBadge({ available, exportedModels }: { available: boolean; exportedModels: string[] }) {
  if (available) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        BERT Sidecar active · {exportedModels.length} model{exportedModels.length !== 1 ? "s" : ""} ready
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-muted-foreground)] text-xs">
      <XCircle className="w-3.5 h-3.5" />
      Sidecar offline — using LLM fallback
    </div>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<Difficulty | null>(null);
  const [bertModel, setBertModel] = useState<BertModel>("general");
  const [gameMode, setGameMode] = useState<GameMode>("classic");
  const [, navigate] = useLocation();

  const { data: sidecarStatus, isLoading: sidecarLoading } = trpc.game.sidecarStatus.useQuery(undefined, {
    refetchInterval: 10_000,
    retry: false,
  });

  const exportedKeys: string[] = sidecarStatus?.available
    ? (sidecarStatus.models as { key: string; exported: boolean }[])
        .filter((m) => m.exported)
        .map((m) => m.key)
    : [];

  function handleStart() {
    if (!selected) return;
    navigate(`/game?difficulty=${selected}&bert=${bertModel}&mode=${gameMode}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute top-[-10%] left-[20%] w-[40vw] h-[40vw] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.14 55) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-5%] right-[10%] w-[30vw] h-[30vw] rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, oklch(0.75 0.16 200) 0%, transparent 70%)" }}
        />
      </div>

      {/* Header */}
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] text-sm mb-6">
          <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          AI-Powered Word Game
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-bold mb-4 leading-tight">
          Fill in the <span className="text-gradient">Blank</span>
        </h1>
        <p className="text-[var(--color-muted-foreground)] text-lg max-w-md mx-auto leading-relaxed">
          Read the sentence, guess the missing word. Our AI evaluates your answer in real time.
        </p>
      </div>

      {/* Sidecar status */}
      <div className="mb-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
        {sidecarLoading ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-muted-foreground)] text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Checking sidecar…
          </div>
        ) : (
          <SidecarBadge available={sidecarStatus?.available ?? false} exportedModels={exportedKeys} />
        )}
      </div>

      {/* BERT model selector */}
      <div className="w-full max-w-2xl mb-8 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
        <div className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted-foreground)] mb-3">
          BERT Model
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BERT_MODELS.map((m) => {
            const isExported = exportedKeys.includes(m.key);
            const sidecarOn = sidecarStatus?.available ?? false;
            const isActive = bertModel === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setBertModel(m.key)}
                className={[
                  "relative flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 btn-press",
                  "bg-[var(--color-card)]",
                  isActive
                    ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40",
                ].join(" ")}
              >
                <span
                  className={`mt-0.5 flex-shrink-0 ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"}`}
                >
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-semibold ${isActive ? "text-[var(--color-foreground)]" : "text-[var(--color-foreground)]"}`}>
                      {m.label}
                    </span>
                    {sidecarOn && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isExported
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-[var(--color-border)] text-[var(--color-muted-foreground)]"
                        }`}
                      >
                        {isExported ? "ONNX" : "export first"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--color-muted-foreground)] leading-snug mt-0.5 line-clamp-2">
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {!(sidecarStatus?.available) && !sidecarLoading && (
          <p className="text-xs text-[var(--color-muted-foreground)] mt-2 leading-relaxed">
            Model selection is available when the local BERT sidecar is running.
            See <code className="text-[var(--color-primary)]">bert_sidecar/README.md</code> to set it up.
          </p>
        )}
      </div>

      {/* Game mode selector */}
      <div className="w-full max-w-2xl mb-8 animate-fade-in-up" style={{ animationDelay: "160ms" }}>
        <div className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted-foreground)] mb-3">
          Game Mode
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {GAME_MODES.map((m, i) => {
            const isActive = gameMode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setGameMode(m.key)}
                className={[
                  "group relative flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-200 btn-press",
                  "bg-[var(--color-card)]",
                  isActive
                    ? `border-current ring-1 ring-current ${m.color}`
                    : `border-[var(--color-border)] ${m.border} text-[var(--color-foreground)]`,
                  "animate-fade-in-up",
                ].join(" ")}
                style={{ animationDelay: `${160 + i * 60}ms` }}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-xl opacity-5 bg-current pointer-events-none" />
                )}
                <div className="flex items-center justify-between">
                  <span className={isActive ? m.color : "text-[var(--color-muted-foreground)]"}>{m.icon}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    isActive
                      ? `${m.color} border-current bg-current/10`
                      : "text-[var(--color-muted-foreground)] border-[var(--color-border)]"
                  }`}>{m.badge}</span>
                </div>
                <div className="font-semibold text-sm">{m.label}</div>
                <div className="text-[11px] text-[var(--color-muted-foreground)] leading-snug">{m.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Difficulty cards */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {DIFFICULTIES.map((d, i) => (
          <button
            key={d.key}
            onClick={() => setSelected(d.key)}
            className={[
              "group relative flex flex-col gap-3 p-6 rounded-xl border text-left transition-all duration-200",
              "bg-[var(--color-card)] border-[var(--color-border)]",
              d.border,
              selected === d.key
                ? `border-current ring-1 ring-current ${d.color}`
                : "text-[var(--color-foreground)]",
              "animate-fade-in-up btn-press",
            ].join(" ")}
            style={{ animationDelay: `${200 + i * 80}ms` }}
          >
            {selected === d.key && (
              <div className="absolute inset-0 rounded-xl opacity-5 bg-current pointer-events-none" />
            )}
            <span className={d.color}>{d.icon}</span>
            <div>
              <div className="font-semibold text-base mb-1">{d.label}</div>
              <div className="text-[var(--color-muted-foreground)] text-sm leading-snug">
                {d.description}
              </div>
            </div>
            <div className={`text-xs font-medium mt-auto ${d.color} opacity-80`}>
              {d.points}
            </div>
          </button>
        ))}
      </div>

      {/* Start button */}
      <div className="animate-fade-in-up" style={{ animationDelay: "450ms" }}>
        <button
          onClick={handleStart}
          disabled={!selected}
          className={[
            "px-10 py-3.5 rounded-xl font-semibold text-base transition-all duration-200 btn-press",
            "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
            selected
              ? "opacity-100 glow-primary hover:brightness-110 cursor-pointer"
              : "opacity-30 cursor-not-allowed",
          ].join(" ")}
        >
          Start Game
        </button>
      </div>

      {/* Rules */}
      <div
        className="mt-10 text-center text-[var(--color-muted-foreground)] text-sm max-w-sm animate-fade-in"
        style={{ animationDelay: "550ms" }}
      >
        <p>
          10 questions per round · Use a{" "}
          <span className="text-hint font-medium">Hint</span> for half points ·{" "}
          {gameMode === "consecutive" && "Fill blanks one at a time in order"}
          {gameMode === "parallel" && "Fill all blanks at once"}
          {gameMode === "classic" && "Score as high as you can"}
        </p>
      </div>
    </div>
  );
}
