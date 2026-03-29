import { useState, useEffect } from "react";
import type { AnalysisResult, ScoreBreakdown, ScoreTier, Suggestion, TrendingAlignment, AccountHealth, ReachForecast as ReachForecastType, WhatIfScenario } from "@reach/shared-types";
import { t } from "./i18n";
import { computeForecast, formatNumber } from "./forecast-engine";

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
        <div className="reachos-section-label">{t('autoOptResults')}</div>
        <div className="reachos-autoopt-summary">
          <span className="reachos-autoopt-badge">
            {result.rounds.length} {t('rounds')} {'\u00B7'} {result.totalGenerated} {t('variations')} {'\u00B7'} +{result.improvement} {t('improvement')}
          </span>
        </div>
        {topResults.map((s, i) => (
          <div key={i} className="reachos-rewrite-item" onClick={() => navigator.clipboard.writeText(s.text)}>
            <div className="reachos-rewrite-header">
              <span className="reachos-rewrite-score">
                {i === 0 ? '\uD83C\uDFC6' : '\uD83D\uDFE2'} {s.score}
              </span>
              <span className={`reachos-rewrite-delta ${s.score - originalScore >= 0 ? 'positive' : 'negative'}`}>
                {s.score - originalScore >= 0 ? '+' : ''}{s.score - originalScore} {t('vsYours')}
              </span>
            </div>
            <div className="reachos-rewrite-text">{s.text}</div>
            <div className="reachos-rewrite-copy">{t('copy')}</div>
          </div>
        ))}
        <button className="reachos-rewrite-btn" onClick={() => { setResult(null); setCurrentRound(0); }}
          style={{ marginTop: '6px', background: 'transparent', border: '1px solid #2f3336', color: '#71767b' }}>
          {t('runAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="reachos-rewrite-section">
      {loading ? (
        <div className="reachos-autoopt-progress">
          <div className="reachos-section-label">{t('autoOptimizing')}</div>
          <div className="reachos-autoopt-bar-bg">
            <div className="reachos-autoopt-bar" style={{ width: `${(currentRound / 5) * 100}%` }} />
          </div>
          <div className="reachos-autoopt-round">Round {currentRound}/5 {'\u2014'} testing variations...</div>
        </div>
      ) : (
        <button className="reachos-rewrite-btn" onClick={handleOptimize} disabled={!text || text.length < 10}
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
          {'\u2728'} {t('autoOptimize')}
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
          <strong>{replyData.count} {t('replyCoach')}</strong> on {replyData.tweets} tweets {'\u2014'} {t('replyCoachBoost')}
        </span>
      </div>
      {replySuggestions.length === 0 ? (
        <button className="reachos-reply-coach-btn" onClick={handleGetReplies} disabled={loading}>
          {loading ? t('generating') : `\uD83D\uDCA1 ${t('getReplyIdeas')}`}
        </button>
      ) : (
        <div className="reachos-reply-suggestions">
          {replySuggestions.map((s, i) => (
            <div key={i} className="reachos-reply-suggestion" onClick={() => navigator.clipboard.writeText(s)}>
              {s}
              <span className="reachos-rewrite-copy">{t('copy')}</span>
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
      <div className="reachos-section-label">{t('selfReplyStrategy')}</div>
      {selfReply ? (
        <div className="reachos-reply-suggestion" onClick={() => { navigator.clipboard.writeText(selfReply); setCopiedReply(true); }}>
          <div style={{ fontSize: '10px', color: '#ffd400', marginBottom: '4px', fontWeight: 600 }}>
            {t('selfReplyInstruction')}
          </div>
          <div style={{ fontSize: '12px', lineHeight: 1.4 }}>{selfReply}</div>
          <span className="reachos-rewrite-copy">{copiedReply ? t('copied') : t('copyAgain')}</span>
        </div>
      ) : (
        <button className="reachos-rewrite-btn" onClick={handleGenerate} disabled={loading} style={{ background: 'linear-gradient(135deg, #00ba7c, #059669)' }}>
          {loading ? t('generating') : `\uD83D\uDD04 ${t('generateSelfReply')}`}
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
  below_average: "Below Average",
  good: "Average",
  excellent: "Strong",
  perfect: "Exceptional",
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
          <div className="reachos-score-label">{t('reachScore')}</div>
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
  key: string;
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
  // v3.0 category caps: hook:30, structure:20, engagement:30, penalty:-55, bonus:15
  const hookPct = (breakdown.hook / 30) * 100;
  const structPct = (breakdown.structure / 20) * 100;
  const engPct = (breakdown.engagement / 30) * 100;
  const penaltyAbs = Math.abs(breakdown.penalties);
  const penaltyPct = (penaltyAbs / 55) * 100;
  const bonusPct = (breakdown.bonuses / 15) * 100;

  return [
    { label: t('hook'), key: "hook", value: breakdown.hook, max: 30, color: getBarColor(hookPct) },
    { label: t('structure'), key: "structure", value: breakdown.structure, max: 20, color: getBarColor(structPct) },
    { label: t('engagement'), key: "engagement", value: breakdown.engagement, max: 30, color: getBarColor(engPct) },
    { label: t('penalties'), key: "penalties", value: breakdown.penalties, max: 55, color: "#f4212e" },
    { label: t('bonuses'), key: "bonuses", value: breakdown.bonuses, max: 15, color: "#00ba7c" },
  ].map((entry) => ({
    ...entry,
    // For penalties, use abs for the bar width percentage
    ...(entry.key === "penalties"
      ? { value: breakdown.penalties }
      : {}),
  }));
}

function BreakdownBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  const entries = buildBreakdownEntries(breakdown);

  return (
    <>
      <div className="reachos-section-label">{t('breakdown')}</div>
      <div className="reachos-breakdown">
        {entries.map((entry) => {
          const displayValue = entry.value;
          const barWidth = entry.key === "penalties"
            ? (Math.abs(entry.value) / entry.max) * 100
            : (entry.value / entry.max) * 100;

          return (
            <div key={entry.key} className="reachos-breakdown-item">
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
                {displayValue > 0 && entry.key !== "penalties" ? `+${displayValue}` : displayValue}
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
      <div className="reachos-no-suggestions">{t('noIssues')}</div>
    );
  }

  const sorted = [...suggestions].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  return (
    <>
      <div className="reachos-section-label">{t('suggestions')}</div>
      <div className="reachos-suggestion-count">{suggestions.length} {suggestions.length !== 1 ? t('suggestions_plural') : t('suggestion')}</div>
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
  if (score <= 20) return { className: "natural", label: t('natural') };
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
    text = `${t('aiCheck')}: ${aiSlopScore}/100 \u2014 ${verdict.label}`;
  } else if (isServerPending) {
    badgeClass += " reachos-pending";
    text = `${t('aiCheck')}: Analyzing...`;
  } else {
    text = `${t('aiCheck')}: ${t('typeMore')}`;
  }

  return (
    <div className="reachos-ai-section">
      <div className={badgeClass}>
        <div className="reachos-ai-badge-text">{text}</div>
      </div>
      {isServerEnhanced && (
        <div className="reachos-server-badge">
          <div className="reachos-server-badge-dot" />
          {t('aiEnhanced')}
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
// ReachForecastPanel — predictive reach with what-if scenarios
// ---------------------------------------------------------------------------
function ReachForecastPanel({ analysis, hasMedia, hasExternalLink }: {
  analysis: AnalysisResult;
  hasMedia: boolean;
  hasExternalLink: boolean;
}) {
  const [forecast, setForecast] = useState<ReachForecastType | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [accountHealth, setAccountHealth] = useState<AccountHealth | null>(null);
  const [timingStatus, setTimingStatus] = useState<'good_now' | 'better_later' | 'off_peak' | null>(null);
  const [avgViews, setAvgViews] = useState<number | null>(null);
  const [trackedCount, setTrackedCount] = useState(0);

  // Load account health and timing data from chrome.storage / API
  useEffect(() => {
    try {
      chrome.storage.local.get(['accountHealth', 'forecastMeta'], (result) => {
        if (result.accountHealth) {
          const data = result.accountHealth as AccountHealth;
          const age = Date.now() - new Date(data.fetchedAt).getTime();
          if (age < 3600000) { // < 1 hour
            setAccountHealth(data);
          }
        }
        if (result.forecastMeta) {
          const meta = result.forecastMeta as { avgViews: number; trackedCount: number };
          setAvgViews(meta.avgViews);
          setTrackedCount(meta.trackedCount);
        }
      });
    } catch { /* extension context */ }

    // Get timing status
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `/api/timing?timezone=${encodeURIComponent(tz)}`, method: 'GET' },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.ok && response.data?.success) {
            setTimingStatus(response.data.data.currentStatus);
          }
        },
      );
    } catch { /* extension context */ }

    // Fetch average views from tracked tweets
    try {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: '/api/tweets/metrics', method: 'GET' },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.ok && response.data?.success && response.data.data) {
            const tweets = response.data.data as Array<{ metrics?: { views?: number } }>;
            const withViews = tweets.filter((tw: { metrics?: { views?: number } }) => tw.metrics && tw.metrics.views && tw.metrics.views > 0);
            if (withViews.length > 0) {
              const avg = Math.round(
                withViews.reduce((sum: number, tw: { metrics?: { views?: number } }) => sum + (tw.metrics?.views ?? 0), 0) / withViews.length,
              );
              setAvgViews(avg);
              setTrackedCount(withViews.length);
              // Cache for next time
              try {
                chrome.storage.local.set({ forecastMeta: { avgViews: avg, trackedCount: withViews.length } });
              } catch { /* non-critical */ }
            }
          }
        },
      );
    } catch { /* extension context */ }
  }, []);

  // Recompute forecast whenever inputs change
  useEffect(() => {
    const result = computeForecast({
      analysis,
      accountHealth,
      timingStatus,
      hasMedia,
      hasExternalLink,
      avgViews,
      trackedTweetCount: trackedCount,
    });
    setForecast(result);
  }, [analysis, accountHealth, timingStatus, hasMedia, hasExternalLink, avgViews, trackedCount]);

  if (!forecast) return null;

  const vsClass = forecast.vsAverage >= 1.2
    ? 'positive'
    : forecast.vsAverage <= 0.8
      ? 'negative'
      : 'neutral';

  const probClass = (v: number) => v >= 50 ? 'high' : v >= 25 ? 'medium' : 'low';

  return (
    <div className="reachos-forecast">
      <div className="reachos-forecast-header">
        <div className="reachos-section-label" style={{ padding: 0, margin: 0 }}>
          {t('reachForecast')}
        </div>
        <button
          className="reachos-minimize-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: '11px' }}
        >
          {expanded ? '\u25B2' : '\u25BC'}
        </button>
      </div>

      {expanded && (
        <>
          {/* Main reach prediction */}
          <div className="reachos-forecast-reach">
            <div className="reachos-forecast-number">
              {formatNumber(forecast.predictedReach)}
            </div>
            <div className="reachos-forecast-range">
              {formatNumber(forecast.reachLow)} - {formatNumber(forecast.reachHigh)} {t('estimatedReach').toLowerCase()}
            </div>
            {forecast.vsAverage !== 1.0 && (
              <div className={`reachos-forecast-vs ${vsClass}`}>
                {forecast.vsAverage >= 1.0 ? '\u25B2' : '\u25BC'} {forecast.vsAverage}x {t('vsYourAvg')}
              </div>
            )}
          </div>

          {/* Probability indicators */}
          <div className="reachos-forecast-probs">
            <div className="reachos-forecast-prob">
              <div className={`reachos-forecast-prob-value ${probClass(forecast.replyProbability)}`}>
                {forecast.replyProbability}%
              </div>
              <div className="reachos-forecast-prob-label">{t('replyProb')}</div>
            </div>
            <div className="reachos-forecast-prob">
              <div className={`reachos-forecast-prob-value ${probClass(forecast.bookmarkProbability)}`}>
                {forecast.bookmarkProbability}%
              </div>
              <div className="reachos-forecast-prob-label">{t('bookmarkProb')}</div>
            </div>
            <div className="reachos-forecast-prob">
              <div className={`reachos-forecast-prob-value ${probClass(forecast.viralChance)}`}>
                {forecast.viralChance}%
              </div>
              <div className="reachos-forecast-prob-label">{t('viralChance')}</div>
            </div>
          </div>

          {/* What-If Scenarios */}
          {forecast.scenarios.length > 0 && (
            <>
              <div className="reachos-section-label" style={{ padding: 0, marginBottom: '6px' }}>
                {t('whatIf')}
              </div>
              <div className="reachos-whatif-list">
                {forecast.scenarios.map((scenario) => (
                  <WhatIfRow key={scenario.id} scenario={scenario} />
                ))}
              </div>
            </>
          )}

          {/* Footer: data source + confidence */}
          <div className="reachos-forecast-footer">
            <span>
              {forecast.isEstimate
                ? t('estimateNote')
                : `${t('basedOn')} ${forecast.dataPoints} ${t('trackedTweets')}`
              }
            </span>
            <div className="reachos-forecast-confidence">
              <span>{Math.round(forecast.confidence * 100)}%</span>
              <div className="reachos-confidence-bar">
                <div
                  className="reachos-confidence-fill"
                  style={{ width: `${Math.round(forecast.confidence * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function WhatIfRow({ scenario }: { scenario: WhatIfScenario }) {
  const itemClass = scenario.alreadyApplied
    ? 'reachos-whatif-item applied'
    : scenario.id === 'combined'
      ? 'reachos-whatif-item combined'
      : 'reachos-whatif-item';

  return (
    <div className={itemClass}>
      <span className="reachos-whatif-icon">{scenario.icon}</span>
      <div className="reachos-whatif-text">
        <div className="reachos-whatif-label">{scenario.label}</div>
        <div className="reachos-whatif-desc">{scenario.description}</div>
      </div>
      <div className="reachos-whatif-delta">
        {scenario.alreadyApplied ? (
          <span className="reachos-whatif-applied-tag">{t('alreadyActive')}</span>
        ) : (
          <>
            <div className={`reachos-whatif-delta-number ${scenario.deltaPercent > 0 ? 'positive' : scenario.deltaPercent < 0 ? 'negative' : 'neutral'}`}>
              {scenario.deltaPercent > 0 ? '+' : ''}{scenario.deltaPercent}%
            </div>
            <div className="reachos-whatif-delta-reach">
              {formatNumber(scenario.predictedReach)}
            </div>
          </>
        )}
      </div>
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
  hasMedia?: boolean;
  hasExternalLink?: boolean;
}

export function ScoreOverlay({ analysis, isServerPending, serverError, currentText, hasMedia = false, hasExternalLink = false }: ScoreOverlayProps) {
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
            {t('serverUnavailable')}
          </div>
        )}

        {analysis === null ? (
          <div className="reachos-idle">
            {t('startTyping')}
          </div>
        ) : (
          <>
            <ScoreCircle score={analysis.reachScore} tier={analysis.tier} />
            <TrendingBadge alignment={analysis.trendingAlignment} />
            <TimingIndicator />
            <BreakdownBars breakdown={analysis.breakdown} />
            <ReachForecastPanel
              analysis={analysis}
              hasMedia={hasMedia}
              hasExternalLink={hasExternalLink}
            />
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
