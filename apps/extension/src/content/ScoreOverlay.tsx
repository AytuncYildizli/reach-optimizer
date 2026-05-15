import { useState, useEffect } from "react";
import type { AnalysisResult, ScoreTier, SignalBucket, SignalName, SignalScore, Suggestion, TrendingAlignment, AccountHealth, ReachForecast as ReachForecastType, WhatIfScenario } from "@reach/shared-types";
import { ScoreEngine } from "@reach/rules-engine";
import { t } from "./i18n";
import { computeForecast, formatNumber } from "./forecast-engine";

// Local scoring engine for auto-optimize (score variations client-side)
const localEngine = new ScoreEngine();

// ---------------------------------------------------------------------------
// AutoOptimizeSection — score-aware optimization with client-side scoring
// Uses user's own Anthropic key (BYOK) or falls back to server.
// ---------------------------------------------------------------------------
function AutoOptimizeSection({ text, originalScore, hasMedia }: { text: string; originalScore: number; hasMedia?: boolean }) {
  const [results, setResults] = useState<{ text: string; score: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [noKeyError, setNoKeyError] = useState(false);
  const [alreadyGood, setAlreadyGood] = useState(false);

  useEffect(() => { setResults([]); setNoKeyError(false); setAlreadyGood(false); }, [text]);

  const handleOptimize = async () => {
    setLoading(true);
    setNoKeyError(false);
    setAlreadyGood(false);

    // 1. Score original with correct context
    const originalResult = localEngine.evaluate({ text, platform: 'x', isThread: false, hasMedia: !!hasMedia });
    const origScore = originalResult.score;

    // 2. Find failing rules to tell the AI what to fix
    const failingRules = originalResult.suggestions
      .filter(s => s.severity === 'critical' || s.severity === 'warning')
      .map(s => s.description)
      .slice(0, 5);

    const failingContext = failingRules.length > 0
      ? `\n\nTHIS TWEET LOSES POINTS ON:\n${failingRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\nFix these specific issues in your rewrites.`
      : '';

    // 3. Detect language
    const isTurkish = /[çşğüöıİŞÇÖÜĞ]/.test(text) || /\b(bir|ve|bu|ile|için|ama|da|de)\b/i.test(text);
    const lang = isTurkish ? 'Turkish' : 'English';

    const systemPrompt = `You are an elite X/Twitter ghostwriter. You REARRANGE tweets to maximize reach. You NEVER add new information.

RULES:
- Tone: provocative and bold, NOT casual
- Hook: strong pattern interrupt or bold claim in the first line
- Length: ~2 sentences, 250-280 characters
- End ~half with a sharp question, ~half with a bold statement
- NO emoji, NO hashtags, NO AI words (delve, landscape, leverage, unleash, paradigm)
- Add a call-to-action or question that invites replies (replies are 54x more valuable than likes in the X algorithm)
- NEVER invent new facts, numbers, or claims not in the original
- PRESERVE the original message and framing
- Write in ${lang}

Return ONLY valid JSON.`;

    const userPrompt = `Rewrite this tweet 3 ways. SAME LANGUAGE (${lang}).

RULES:
1. PRESERVE the original message, analogies, and framing
2. NEVER invent new facts or numbers not in the original
3. Only change: word order, sentence structure, hook placement, ending
4. Each rewrite under 280 chars
5. NO emoji, NO hashtags
${failingContext}

V1: Lead with the strongest claim, end with a question
V2: Start with a provocative question the tweet answers
V3: Bold contrarian hook + call-to-action ending

Original tweet: "${text.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["v1", "v2", "v3"]}`;

    try {
      // Try BYOK first (direct Anthropic call via service worker)
      chrome.runtime.sendMessage(
        {
          type: 'DIRECT_ANTHROPIC',
          systemPrompt,
          userPrompt,
          temperature: 0.4,
          maxTokens: 1024,
        },
        (response) => {
          if (chrome.runtime.lastError) { setLoading(false); return; }

          if (response?.ok && response.data?.text) {
            processAiResponse(response.data.text, origScore);
          } else if (response?.error?.includes('No Anthropic API key')) {
            // Fallback: try server
            chrome.runtime.sendMessage(
              { type: 'API_REQUEST', endpoint: '/api/tweets/auto-optimize', method: 'POST',
                body: { content: text, maxRounds: 2 } },
              (serverResponse) => {
                setLoading(false);
                if (serverResponse?.ok && serverResponse.data?.success) {
                  const serverResults = serverResponse.data.data.rounds
                    .flatMap((r: { alternatives: { text: string; score: number }[] }) => r.alternatives)
                    .filter((v: { score: number }) => v.score > origScore)
                    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
                    .slice(0, 3);
                  if (serverResults.length === 0) {
                    setAlreadyGood(true);
                  } else {
                    setResults(serverResults);
                  }
                } else {
                  setNoKeyError(true);
                }
              }
            );
          } else {
            setLoading(false);
          }
        }
      );
    } catch {
      setLoading(false);
    }

    function processAiResponse(rawText: string, baseScore: number) {
      try {
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const suggestions: string[] = (parsed.suggestions || []).filter(
          (s: string) => s && s.length > 10 && s.length <= 280
        );

        // Score each variation CLIENT-SIDE with correct hasMedia context
        const scored = suggestions.map(s => ({
          text: s,
          score: localEngine.evaluate({ text: s, platform: 'x', isThread: false, hasMedia: !!hasMedia }).score,
        }));

        // ONLY show results that score HIGHER than original
        const better = scored
          .filter(s => s.score > baseScore)
          .sort((a, b) => b.score - a.score);

        setLoading(false);
        if (better.length === 0) {
          setAlreadyGood(true);
        } else {
          setResults(better);
        }
      } catch {
        setLoading(false);
      }
    }
  };

  // Already optimized message
  if (alreadyGood) {
    return (
      <div className="reachos-rewrite-section">
        <div style={{ padding: '8px 10px', background: 'rgba(0,186,124,0.1)', borderRadius: 8, border: '1px solid rgba(0,186,124,0.3)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#00ba7c', marginBottom: 2 }}>
            Your tweet is already strong
          </div>
          <div style={{ fontSize: 10, color: '#71767b' }}>
            AI couldn't find a higher-scoring variation. Try changing the content or adding a question.
          </div>
        </div>
        <button className="reachos-rewrite-btn" onClick={() => { setAlreadyGood(false); setResults([]); }}
          style={{ marginTop: '6px', background: 'transparent', border: '1px solid #2f3336', color: '#71767b' }}>
          {t('runAgain')}
        </button>
      </div>
    );
  }

  // No API key error
  if (noKeyError) {
    return (
      <div className="reachos-rewrite-section">
        <div style={{ padding: '8px 10px', background: 'rgba(255,212,0,0.1)', borderRadius: 8, border: '1px solid rgba(255,212,0,0.3)' }}>
          <div style={{ fontSize: 11, color: '#8a6d00', lineHeight: 1.4 }}>
            Add your Anthropic API key in the extension popup Settings tab to enable AI optimization.
          </div>
        </div>
      </div>
    );
  }

  // Show results
  if (results.length > 0) {
    return (
      <div className="reachos-rewrite-section">
        <div className="reachos-section-label">{t('autoOptResults')}</div>
        <div className="reachos-autoopt-summary">
          <span className="reachos-autoopt-badge">
            {results.length} {t('variations')} {'\u00B7'} +{results[0].score - originalScore} {t('improvement')}
          </span>
        </div>
        {results.map((s, i) => (
          <div key={i} className="reachos-rewrite-item" onClick={() => navigator.clipboard.writeText(s.text)}>
            <div className="reachos-rewrite-header">
              <span className="reachos-rewrite-score">
                {i === 0 ? '\uD83C\uDFC6' : '\uD83D\uDFE2'} {s.score}
              </span>
              <span className="reachos-rewrite-delta positive">
                +{s.score - originalScore} {t('vsYours')}
              </span>
            </div>
            <div className="reachos-rewrite-text">{s.text}</div>
            <div className="reachos-rewrite-copy">{t('copy')}</div>
          </div>
        ))}
        <button className="reachos-rewrite-btn" onClick={() => { setResults([]); setAlreadyGood(false); }}
          style={{ marginTop: '6px', background: 'transparent', border: '1px solid #2f3336', color: '#71767b' }}>
          {t('runAgain')}
        </button>
      </div>
    );
  }

  // Default: show button
  return (
    <div className="reachos-rewrite-section">
      {loading ? (
        <div className="reachos-autoopt-progress">
          <div className="reachos-section-label">{t('autoOptimizing')}</div>
          <div className="reachos-autoopt-bar-bg">
            <div className="reachos-autoopt-bar" style={{ width: '60%' }} />
          </div>
          <div className="reachos-autoopt-round">Generating &amp; scoring variations...</div>
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

    const isTurkish = /[çşğüöıİŞÇÖÜĞ]/.test(text) || /\b(bir|ve|bu|ile|için|ama|da|de)\b/i.test(text);
    const lang = isTurkish ? 'Turkish' : 'English';

    // Try BYOK first (direct Anthropic)
    chrome.runtime.sendMessage(
      {
        type: 'DIRECT_ANTHROPIC',
        systemPrompt: `You write self-replies for X/Twitter. A self-reply is the FIRST reply the author posts under their own tweet. Write in ${lang}. Return ONLY valid JSON.`,
        userPrompt: `Write 1 self-reply for this tweet. RULES:
1. SAME LANGUAGE as the original (${lang})
2. Reference a SPECIFIC concept from the original tweet
3. Add ONE specific detail or pointed question about something in the tweet
4. Under 200 characters, no emoji unless original has them
5. Sound like a real person continuing their thought

Original tweet: "${text.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["self-reply"]}`,
        temperature: 0.5,
        maxTokens: 256,
      },
      (response) => {
        if (response?.ok && response.data?.text) {
          clearTimeout(timeout);
          setLoading(false);
          try {
            const cleaned = response.data.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.suggestions?.[0]) {
              setSelfReply(parsed.suggestions[0]);
              navigator.clipboard.writeText(parsed.suggestions[0]);
              setCopiedReply(true);
              return;
            }
          } catch { /* fall through to server */ }
        }

        // Fallback to server
        chrome.runtime.sendMessage(
          { type: 'API_REQUEST', endpoint: '/api/suggest', method: 'POST',
            body: { content: text, type: 'self-reply' } },
          (serverResponse) => {
            clearTimeout(timeout);
            setLoading(false);
            if (chrome.runtime.lastError) return;
            if (serverResponse?.ok && serverResponse.data?.success && serverResponse.data.suggestions?.length > 0) {
              const reply = serverResponse.data.suggestions[0];
              setSelfReply(reply);
              navigator.clipboard.writeText(reply);
              setCopiedReply(true);
            }
          }
        );
      }
    );
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
interface BucketEntry {
  bucket: SignalBucket;
  label: string;
  value: number;
  max: number;
  signals: SignalScore[];
  color: string;
}

function getBarColor(percentage: number): string {
  if (percentage >= 70) return "#00ba7c";
  if (percentage >= 40) return "#ffd400";
  return "#f4212e";
}

const BUCKET_ORDER: SignalBucket[] = ['engagement', 'curiosity', 'dwell', 'risk'];

const BUCKET_LABELS: Record<SignalBucket, string> = {
  engagement: 'Engagement',
  curiosity: 'Curiosity',
  dwell: 'Dwell',
  risk: 'Risk',
};

function groupByBucket(
  signalScores: Record<SignalName, SignalScore>,
  applicable: SignalName[],
): BucketEntry[] {
  const groups: Record<SignalBucket, SignalScore[]> = {
    engagement: [],
    curiosity: [],
    dwell: [],
    risk: [],
  };
  for (const name of applicable) {
    const s = signalScores[name];
    groups[s.bucket].push(s);
  }
  return BUCKET_ORDER.map((bucket) => {
    const signals = groups[bucket];
    const value = signals.reduce((sum, s) => sum + s.score, 0);
    const max = signals.reduce(
      (sum, s) => sum + (bucket === 'risk' ? Math.abs(s.max) : s.max),
      0,
    );
    const pct = max > 0 ? (Math.abs(value) / max) * 100 : 0;
    const color = bucket === 'risk' ? '#f4212e' : getBarColor(pct);
    return { bucket, label: BUCKET_LABELS[bucket], value, max, signals, color };
  });
}

function BreakdownBars({
  signalScores,
  applicable,
}: {
  signalScores: Record<SignalName, SignalScore>;
  applicable: SignalName[];
}) {
  const entries = groupByBucket(signalScores, applicable);

  return (
    <>
      <div className="reachos-section-label">Signals</div>
      <div className="reachos-breakdown">
        {entries.map((entry) => {
          const barWidth = entry.max > 0
            ? (Math.abs(entry.value) / entry.max) * 100
            : 0;
          return (
            <div key={entry.bucket} className="reachos-breakdown-item">
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
                {entry.value > 0 ? `+${entry.value}` : entry.value}
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
    // Broadcast predicted reach so post-tracker can capture it
    window.dispatchEvent(new CustomEvent('reachos-forecast-update', {
      detail: { predictedReach: result.predictedReach },
    }));
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
          <span className={`color-${analysis.tier}`}>{analysis.score}</span>
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
            <ScoreCircle score={analysis.score} tier={analysis.tier} />
            <TrendingBadge alignment={analysis.trendingAlignment} />
            <TimingIndicator />
            <BreakdownBars signalScores={analysis.signalScores} applicable={analysis.applicableSignals} />
            <ReachForecastPanel
              analysis={analysis}
              hasMedia={hasMedia}
              hasExternalLink={hasExternalLink}
            />
            <SuggestionList suggestions={analysis.suggestions} />
            <ReplyCoachBanner />
            {currentText && (
              <AutoOptimizeSection text={currentText} originalScore={analysis.score} hasMedia={hasMedia} />
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
