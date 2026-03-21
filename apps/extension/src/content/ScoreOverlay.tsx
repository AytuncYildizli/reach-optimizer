import { useState, useEffect } from "react";
import type { AnalysisResult, ScoreBreakdown, ScoreTier, Suggestion } from "@reach/shared-types";

// ---------------------------------------------------------------------------
// Tier color and label mappings
// ---------------------------------------------------------------------------
const TIER_COLORS: Record<ScoreTier, string> = {
  critical: "#f4212e",
  below_average: "#ffd400",
  good: "#00ba7c",
  excellent: "#00ba7c",
  perfect: "#1d9bf0",
};

const TIER_LABELS: Record<ScoreTier, string> = {
  critical: "Don't Post",
  below_average: "Needs Work",
  good: "Good",
  excellent: "Excellent",
  perfect: "Perfect",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

// ---------------------------------------------------------------------------
// AnimatedScore — counts up/down when score changes
// ---------------------------------------------------------------------------
function AnimatedScore({ value, tier }: { value: number; tier: string }) {
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const diff = value - displayed;
    if (diff === 0) return;
    const step = diff > 0 ? 1 : -1;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        const next = prev + step;
        if ((step > 0 && next >= value) || (step < 0 && next <= value)) {
          clearInterval(interval);
          return value;
        }
        return next;
      });
    }, 20);
    return () => clearInterval(interval);
  }, [value]);

  return <span className={`reachos-score-number color-${tier}`}>{displayed}</span>;
}

// ---------------------------------------------------------------------------
// ScoreCircle
// ---------------------------------------------------------------------------
function ScoreCircle({ score, tier }: { score: number; tier: ScoreTier }) {
  const color = TIER_COLORS[tier];
  const angle = (score / 100) * 360;

  const gradientStyle = {
    background: `conic-gradient(${color} 0deg, ${color} ${angle}deg, #2f3336 ${angle}deg)`,
  };

  return (
    <div className="reachos-score-section">
      <div className="reachos-score-circle">
        <div className="reachos-score-circle-bg" />
        <div className="reachos-score-circle-fill" style={gradientStyle} />
        <div className="reachos-score-circle-inner">
          <AnimatedScore value={score} tier={tier} />
          <div className="reachos-score-label">REACH SCORE</div>
        </div>
      </div>
      <div className={`reachos-tier-label color-${tier}`}>
        {TIER_LABELS[tier]}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BreakdownBars
// ---------------------------------------------------------------------------
interface BreakdownEntry {
  label: string;
  value: number;
  max: number;
  color: string;
}

function getBarColor(percentage: number): string {
  if (percentage >= 70) return "#00ba7c";
  if (percentage >= 40) return "#ffd400";
  return "#f4212e";
}

function buildBreakdownEntries(breakdown: ScoreBreakdown): BreakdownEntry[] {
  const hookPct = (breakdown.hook / 25) * 100;
  const structPct = (breakdown.structure / 20) * 100;
  const engPct = (breakdown.engagement / 20) * 100;
  const penaltyAbs = Math.abs(breakdown.penalties);
  const penaltyPct = (penaltyAbs / 30) * 100;
  const bonusPct = (breakdown.bonuses / 15) * 100;

  return [
    { label: "Hook", value: breakdown.hook, max: 25, color: getBarColor(hookPct) },
    { label: "Structure", value: breakdown.structure, max: 20, color: getBarColor(structPct) },
    { label: "Engagement", value: breakdown.engagement, max: 20, color: getBarColor(engPct) },
    { label: "Penalties", value: breakdown.penalties, max: 30, color: "#f4212e" },
    { label: "Bonuses", value: breakdown.bonuses, max: 15, color: "#00ba7c" },
  ].map((entry) => ({
    ...entry,
    // For penalties, use abs for the bar width percentage
    ...(entry.label === "Penalties"
      ? { value: breakdown.penalties }
      : {}),
  }));
}

function BreakdownBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  const entries = buildBreakdownEntries(breakdown);

  return (
    <>
      <div className="reachos-section-label">Breakdown</div>
      <div className="reachos-breakdown">
        {entries.map((entry) => {
          const displayValue = entry.label === "Penalties"
            ? entry.value
            : entry.value;
          const barWidth = entry.label === "Penalties"
            ? (Math.abs(entry.value) / entry.max) * 100
            : (entry.value / entry.max) * 100;

          return (
            <div key={entry.label} className="reachos-breakdown-item">
              <span className="reachos-breakdown-label">{entry.label}</span>
              <div className="reachos-breakdown-bar-bg">
                <div
                  className="reachos-breakdown-bar"
                  style={{
                    width: `${Math.min(100, Math.max(0, barWidth))}%`,
                    background: entry.color,
                  }}
                />
              </div>
              <span
                className="reachos-breakdown-value"
                style={{ color: entry.color }}
              >
                {displayValue > 0 && entry.label !== "Penalties" ? `+${displayValue}` : displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SuggestionList
// ---------------------------------------------------------------------------
function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div className="reachos-no-suggestions">No issues found - looking good!</div>
    );
  }

  const sorted = [...suggestions].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  return (
    <>
      <div className="reachos-section-label">Suggestions</div>
      <div className="reachos-suggestion-count">{suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}</div>
      <div className="reachos-suggestions">
        {sorted.map((s) => (
          <div key={s.ruleId} className={`reachos-suggestion ${s.severity}`}>
            <div className="reachos-suggestion-title">{s.title}</div>
            {s.description}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AISlopBadge
// ---------------------------------------------------------------------------
interface AISlopBadgeProps {
  aiSlopScore: number | null;
  isServerPending: boolean;
  isServerEnhanced: boolean;
}

function getAiSlopVerdict(score: number): { className: string; label: string } {
  if (score <= 20) return { className: "natural", label: "Natural \u2014 Human-written" };
  if (score <= 40) return { className: "mild", label: "Mild AI patterns" };
  if (score <= 60) return { className: "moderate", label: "Moderate AI patterns" };
  if (score <= 80) return { className: "high", label: "High AI probability" };
  return { className: "obvious", label: "Obvious AI \u2014 Rewrite" };
}

function AISlopBadge({ aiSlopScore, isServerPending, isServerEnhanced }: AISlopBadgeProps) {
  let badgeClass = "reachos-ai-badge";
  let text: string;

  if (aiSlopScore !== null) {
    const verdict = getAiSlopVerdict(aiSlopScore);
    badgeClass += ` ${verdict.className}`;
    text = `AI Check: ${aiSlopScore}/100 \u2014 ${verdict.label}`;
  } else if (isServerPending) {
    badgeClass += " reachos-pending";
    text = "AI Check: Analyzing...";
  } else {
    text = "AI Check: Type more to analyze";
  }

  return (
    <div className="reachos-ai-section">
      <div className={badgeClass}>
        <div className="reachos-ai-badge-text">{text}</div>
      </div>
      {isServerEnhanced && (
        <div className="reachos-server-badge">
          <div className="reachos-server-badge-dot" />
          AI Enhanced
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreOverlay (main export)
// ---------------------------------------------------------------------------
interface ScoreOverlayProps {
  analysis: AnalysisResult | null;
  isServerPending: boolean;
  serverError: boolean;
}

export function ScoreOverlay({ analysis, isServerPending, serverError }: ScoreOverlayProps) {
  const [minimized, setMinimized] = useState(false);

  if (minimized && analysis) {
    return (
      <div id="reachos-container">
        <div className="reachos-mini-badge" onClick={() => setMinimized(false)}>
          <span className={`color-${analysis.tier}`}>{analysis.reachScore}</span>
        </div>
      </div>
    );
  }

  return (
    <div id="reachos-container">
      <div className="reachos-panel">
        {/* Header */}
        <div className="reachos-header">
          <div className="reachos-logo">
            <div className="reachos-dot" />
            ReachOS
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div className="reachos-badge">Beta</div>
            {analysis && (
              <button
                className="reachos-minimize-btn"
                onClick={() => setMinimized(true)}
                title="Minimize"
              >
                &#x2212;
              </button>
            )}
          </div>
        </div>

        {serverError && (
          <div className="reachos-error">
            Server unavailable - showing local analysis only
          </div>
        )}

        {analysis === null ? (
          <div className="reachos-idle">
            Start typing in the tweet composer...
          </div>
        ) : (
          <>
            <ScoreCircle score={analysis.reachScore} tier={analysis.tier} />
            <BreakdownBars breakdown={analysis.breakdown} />
            <SuggestionList suggestions={analysis.suggestions} />
            <AISlopBadge
              aiSlopScore={analysis.aiSlopScore}
              isServerPending={isServerPending}
              isServerEnhanced={analysis.isServerEnhanced}
            />
          </>
        )}
      </div>
    </div>
  );
}
