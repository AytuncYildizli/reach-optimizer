import type {
  AnalysisResult,
  PostContext,
  ScoreTier,
  SignalName,
  SignalScore,
  Suggestion,
  TextHighlight,
  TweetInput,
} from '@reach/shared-types';
import { SIGNAL_NAMES } from '@reach/shared-types';
import weights from './config/weights.json';
import { buildContext } from './context';
import { runAllSignals } from './signals';

const TIER_ORDER: ScoreTier[] = ['critical', 'below_average', 'good', 'excellent', 'perfect'];

export class ScoreEngine {
  evaluate(input: TweetInput): AnalysisResult {
    const ctx = buildContext(input);

    if (!ctx.text || ctx.text.trim().length < 3) {
      return emptyResult();
    }

    const signalScores = runAllSignals(ctx);
    const applicableSignals: SignalName[] = SIGNAL_NAMES.filter((s) => signalScores[s].applicable);

    let total = weights.baseScore;
    for (const name of applicableSignals) {
      total += signalScores[name].score;
    }

    const score = Math.max(0, Math.min(100, total));
    const tier = assignTier(score);
    const suggestions = collectSuggestions(signalScores);

    return {
      score,
      baseScore: weights.baseScore,
      tier,
      signalScores,
      applicableSignals,
      aiSlopScore: null,
      suggestions,
      highlights: [],
      isServerEnhanced: false,
    };
  }

  /** Expose context construction so consumers (server, tests) can reuse it. */
  buildContext(input: TweetInput): PostContext {
    return buildContext(input);
  }
}

function emptyResult(): AnalysisResult {
  const empty = {} as Record<SignalName, SignalScore>;
  for (const name of SIGNAL_NAMES) {
    const cfg = (weights.signals as Record<string, { maxPoints?: number; maxPenalty?: number; type: 'positive' | 'negative'; bucket: string }>)[
      name
    ];
    empty[name] = {
      signal: name,
      type: cfg.type,
      bucket: cfg.bucket as SignalScore['bucket'],
      score: 0,
      max: cfg.type === 'positive' ? (cfg.maxPoints ?? 0) : (cfg.maxPenalty ?? 0),
      applicable: false,
      firedRules: [],
      subRules: [],
    };
  }
  return {
    score: 0,
    baseScore: weights.baseScore,
    tier: 'critical',
    signalScores: empty,
    applicableSignals: [],
    aiSlopScore: null,
    suggestions: [],
    highlights: [],
    isServerEnhanced: false,
  };
}

function assignTier(score: number): ScoreTier {
  for (const tier of TIER_ORDER) {
    const t = (weights.tiers as Record<string, { min: number; max: number }>)[tier];
    if (score >= t.min && score <= t.max) return tier;
  }
  return 'critical';
}

function collectSuggestions(
  signalScores: Record<SignalName, SignalScore>,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const name of SIGNAL_NAMES) {
    const s = signalScores[name];
    if (!s.applicable || !s.suggestion) continue;
    out.push({
      signal: name,
      ruleId: `signal:${name}`,
      severity:
        s.type === 'negative' && s.score < 0
          ? 'warning'
          : s.score >= s.max * 0.7
            ? 'positive'
            : 'info',
      title: humanizeSignal(name),
      description: s.suggestion,
    });
  }
  return out;
}

function humanizeSignal(name: SignalName): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type { TextHighlight };
