import { useState, useEffect } from "react";
import type { AnalysisResult, ScoreBreakdown, ScoreTier, Suggestion, TrendingAlignment } from "@reach/shared-types";

// ---------------------------------------------------------------------------
// AutoOptimizeSection — iterative tweet optimization (autoresearch-inspired)
// ---------------------------------------------------------------------------
function AutoOptimizeSection({ text, originalScore }: { text: string; originalScore: number }) {
  const [result, setResult] = useState<{
    rounds: { round: number; bestText: string; bestScore: number; delta: number; alternatives: { text: string; score: number }[] }[];
    bestText: string;
    finalScore: number;
    improvement: number;
    totalGenerated: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);

  useEffect(() => { setResult(null); setCurrentRound(0); }, [text]);

  const handleOptimize = () => {
    setLoading(true);
    setCurrentRound(1);
    const timeout = setTimeout(() => { setLoading(false); setCurrentRound(0); }, 60000);

    // Simulate round progress (since we can't stream)
    let round = 1;
    const progressInterval = setInterval(() => {
      round++;
      if (round <= 5) setCurrentRound(round);
      else clearInterval(progressInterval);
    }, 3000); // ~3s per round estimate

    try {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: '/api/tweets/auto-optimize', method: 'POST',
          body: { content: text, maxRounds: 5 } },
        (response) => {
          clearTimeout(timeout);
          clearInterval(progressInterval);
          setLoading(false);
          if (chrome.runtime.lastError) return;
          if (response?.ok && response.data?.success) {
            setResult(response.data.data);
            setCurrentRound(response.data.data.rounds.length);
          }
        }
      );
    } catch {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  if (result) {
    // Show final results — collect top 3 unique alternatives across all rounds
    const topResults = result.rounds
      .flatMap(r => r.alternatives)
      .sort((a, b) => b.score - a.score)
      .filter((v, i, arr) => arr.findIndex(x => x.text === v.text) === i)
      .slice(0, 3);

    return (
      <div className="reachos-rewrite-section">
        <div className="reachos-section-label">AUTO-OPTIMIZE RESULTS</div>
        <div className="reachos-autoopt-summary">
          <span className="reachos-autoopt-badge">
            {result.rounds.length} rounds {'\u00B7'} {result.totalGenerated} variations {'\u00B7'} +{result.improvement} improvement
          </span>
        </div>
        {topResults.map((s, i) => (
          <div key={i} className="reachos-rewrite-item" onClick={() => navigator.clipboard.writeText(s.text)}>
            <div className="reachos-rewrite-header">
              <span className="reachos-rewrite-score">
                {i === 0 ? '\uD83C\uDFC6' : '\uD83D\uDFE2'} {s.score}
              </span>
              <span className={`reachos-rewrite-delta ${s.score - originalScore >= 0 ? 'positive' : 'negative'}`}>
                {s.score - originalScore >= 0 ? '+' : ''}{s.score - originalScore} vs yours
              </span>
            </div>
            <div className="reachos-rewrite-text">{s.text}</div>
            <div className="reachos-rewrite-copy">Copy</div>
          </div>
        ))}
        <button className="reachos-rewrite-btn" onClick={() => { setResult(null); setCurrentRound(0); }}
          style={{ marginTop: '6px', background: 'transparent', border: '1px solid #2f3336', color: '#71767b' }}>
          Run Again
        </button>
      </div>
    );
  }

  return (
    <div className="reachos-rewrite-section">
      {loading ? (
        <div className="reachos-autoopt-progress">
          <div className="reachos-section-label">AUTO-OPTIMIZING...</div>
          <div className="reachos-autoopt-bar-bg">
            <div className="reachos-autoopt-bar" style={{ width: `${(currentRound / 5) * 100}%` }} />
          </div>
          <div className="reachos-autoopt-round">Round {currentRound}/5 {'\u2014'} testing variations...</div>
        </div>
      ) : (
        <button className="reachos-rewrite-btn" onClick={handleOptimize} disabled={!text || text.length < 10}
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
          {'\u2728'} Auto-Optimize (iterative AI rewriting)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReplyCoachBanner — notifies user about unanswered replies
// ---------------------------------------------------------------------------
function ReplyCoachBanner() {
  const [replyData, setReplyData] = useState<{ count: number; tweets: number } | null>(null);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setReplyData(e.detail);
    };
    window.addEventListener('reachos-reply-coach', handler as EventListener);
    return () => window.removeEventListener('reachos-reply-coach', handler as EventListener);
  }, []);

  const handleGetReplies = () => {
    setLoading(true);
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: '/api/tweets/reply-suggestions', method: 'POST',
        body: { context: 'Reply to engaged followers to boost algorithm distribution' } },
      (response) => {
        setLoading(false);
        if (response?.ok && response.data?.success) {
          setReplySuggestions(response.data.suggestions);
        }
      }
    );
  };

  if (!replyData || replyData.count === 0) return null;

  return (
    <div className="reachos-reply-coach">
      <div className="reachos-reply-coach-header">
        <span className="reachos-reply-coach-icon">{'\uD83D\uDCAC'}</span>
        <span className="reachos-reply-coach-text">
          <strong>{replyData.count} replies</strong> on {replyData.tweets} tweets {'\u2014'} reply back for <strong>150x boost!</strong>
        </span>
      </div>
      {replySuggestions.length === 0 ? (
        <button className="reachos-reply-coach-btn" onClick={handleGetReplies} disabled={loading}>
          {loading ? 'Generating...' : '\uD83D\uDCA1 Get Reply Ideas'}
        </button>
      ) : (
        <div className="reachos-reply-suggestions">
          {replySuggestions.map((s, i) => (
            <div key={i} className="reachos-reply-suggestion" onClick={() => navigator.clipboard.writeText(s)}>
              {s}
              <span className="reachos-rewrite-copy">Copy</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelfReplyGenerator — generates a self-reply to kickstart conversations
// ---------------------------------------------------------------------------
function SelfReplyGenerator({ text }: { text: string }) {
  const [selfReply, setSelfReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);

  const handleGenerate = () => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 15000);
    try {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: '/api/suggest', method: 'POST',
          body: { content: text, type: 'self-reply' } },
        (response) => {
          clearTimeout(timeout);
          setLoading(false);
          if (chrome.runtime.lastError) return;
          if (response?.ok && response.data?.success && response.data.suggestions?.length > 0) {
            const reply = response.data.suggestions[0];
            setSelfReply(reply);
            navigator.clipboard.writeText(reply); // Auto-copy
            setCopiedReply(true);
          }
        }
      );
    } catch {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  // Reset when text changes
  useEffect(() => { setSelfReply(null); setCopiedReply(false); }, [text]);

  if (!text || text.length < 20) return null;

  return (
    <div className="reachos-self-reply">
      <div className="reachos-section-label">SELF-REPLY STRATEGY</div>
      {selfReply ? (
        <div className="reachos-reply-suggestion" onClick={() => { navigator.clipboard.writeText(selfReply); setCopiedReply(true); }}>
          <div style={{ fontSize: '10px', color: '#ffd400', marginBottom: '4px', fontWeight: 600 }}>
            Copied! Post your tweet first, then paste this as your first reply:
          </div>
          <div style={{ fontSize: '12px', lineHeight: 1.4 }}>{selfReply}</div>
          <span className="reachos-rewrite-copy">{copiedReply ? 'Copied!' : 'Copy again'}</span>
        </div>
      ) : (
        <button className="reachos-rewrite-btn" onClick={handleGenerate} disabled={loading} style={{ background: 'linear-gradient(135deg, #00ba7c, #059669)' }}>
          {loading ? 'Generating...' : '\uD83D\uDD04 Generate Self-Reply (starts conversation)'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimingIndicator — shows best posting time below the score
// ---------------------------------------------------------------------------
function TimingIndicator() {
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<'good_now' | 'better_later' | 'off_peak' | null>(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `/api/timing?timezone=${encodeURIComponent(tz)}`, method: 'GET' },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.ok && response.data?.success) {
            setMessage(response.data.data.message);
            setStatus(response.data.data.currentStatus);
          }
        }
      );
    } catch {
      // Extension context may be invalid
    }
  }, []);

  if (!message) return null;

  const statusClass = status === 'good_now'
    ? 'reachos-timing-good'
    : status === 'better_later'
      ? 'reachos-timing-later'
      : 'reachos-timing-off';

  return (
    <div className={`reachos-timing-indicator ${statusClass}`}>
      <span className="reachos-timing-icon">
        {status === 'good_now' ? '\u2705' : '\u23F0'}
      </span>
      <span className="reachos-timing-text">{message}</span>
    </div>
  );
}

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
  const bonusPct = (breakdown.bonuses / 20) * 100;

  return [
    { label: "Hook", value: breakdown.hook, max: 25, color: getBarColor(hookPct) },
    { label: "Structure", value: breakdown.structure, max: 20, color: getBarColor(structPct) },
    { label: "Engagement", value: breakdown.engagement, max: 20, color: getBarColor(engPct) },
    { label: "Penalties", value: breakdown.penalties, max: 30, color: "#f4212e" },
    { label: "Bonuses", value: breakdown.bonuses, max: 20, color: "#00ba7c" },
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
// TrendingBadge — shows when tweet aligns with a trending topic
// ---------------------------------------------------------------------------
function TrendingBadge({ alignment }: { alignment?: TrendingAlignment | null }) {
  if (!alignment || !alignment.isAligned || alignment.matchedTrends.length === 0) {
    return null;
  }

  return (
    <div className="reachos-trending-section">
      {alignment.matchedTrends.map((trend) => (
        <div key={trend.keyword} className="reachos-trending-badge">
          <span className="reachos-trending-icon">{'\uD83D\uDD25'}</span>
          <span className="reachos-trending-text">
            Trending: {trend.name}
          </span>
          <span className="reachos-trending-bonus">+{alignment.bonusPoints}</span>
        </div>
      ))}
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
  currentText?: string;
}

export function ScoreOverlay({ analysis, isServerPending, serverError, currentText }: ScoreOverlayProps) {
  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Hidden = completely invisible, show via extension popup later
  if (hidden) return null;

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
            <button
              className="reachos-minimize-btn"
              onClick={() => setHidden(true)}
              title="Close"
            >
              &#x2715;
            </button>
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
            <TrendingBadge alignment={analysis.trendingAlignment} />
            <TimingIndicator />
            <BreakdownBars breakdown={analysis.breakdown} />
            <SuggestionList suggestions={analysis.suggestions} />
            <ReplyCoachBanner />
            {currentText && (
              <AutoOptimizeSection text={currentText} originalScore={analysis.reachScore} />
            )}
            {currentText && (
              <SelfReplyGenerator text={currentText} />
            )}
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
