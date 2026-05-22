import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, BookOpen, Zap, Trophy } from "lucide-react";

type Difficulty = "Easy" | "Medium" | "Hard";

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

export default function Home() {
  const [selected, setSelected] = useState<Difficulty | null>(null);
  const [, navigate] = useLocation();

  function handleStart() {
    if (!selected) return;
    navigate(`/game?difficulty=${selected}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Ambient background blobs */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div
          className="absolute top-[-10%] left-[20%] w-[40vw] h-[40vw] rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, oklch(0.78 0.14 55) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-5%] right-[10%] w-[30vw] h-[30vw] rounded-full opacity-8"
          style={{
            background:
              "radial-gradient(circle, oklch(0.75 0.16 200) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Header */}
      <div className="text-center mb-14 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] text-sm mb-6">
          <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          AI-Powered Word Game
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-bold mb-4 leading-tight">
          Fill in the{" "}
          <span className="text-gradient">Blank</span>
        </h1>
        <p className="text-[var(--color-muted-foreground)] text-lg max-w-md mx-auto leading-relaxed">
          Read the sentence, guess the missing word. Our AI evaluates your
          answer in real time.
        </p>
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
              `animate-fade-in-up delay-${(i + 1) * 100}`,
              "btn-press",
            ].join(" ")}
            style={{ animationDelay: `${(i + 1) * 80}ms` }}
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
            <div
              className={`text-xs font-medium mt-auto ${d.color} opacity-80`}
            >
              {d.points}
            </div>
          </button>
        ))}
      </div>

      {/* Start button */}
      <div className="animate-fade-in-up" style={{ animationDelay: "350ms" }}>
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
        className="mt-12 text-center text-[var(--color-muted-foreground)] text-sm max-w-sm animate-fade-in"
        style={{ animationDelay: "450ms" }}
      >
        <p>
          10 questions per round &middot; Use a{" "}
          <span className="text-hint font-medium">Hint</span> for half points
          &middot; Score as high as you can
        </p>
      </div>
    </div>
  );
}
