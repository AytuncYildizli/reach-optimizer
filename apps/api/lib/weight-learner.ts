import { SIGNAL_NAMES, type SignalName } from '@reach/shared-types';
import { MAX_LEARNED_ADJUSTMENT } from '@reach/rules-engine';
import { prisma } from './db';

/** Adjustment keys match the ruleIds the v4 engine puts on suggestions. */
const signalRuleId = (name: SignalName) => `signal:${name}`;
const ALL_RULE_IDS = SIGNAL_NAMES.map(signalRuleId);

export interface RulePerformance {
  ruleId: string;
  timesTriggered: number;
  avgOutcomeWhenTriggered: number;
  avgOutcomeWhenNotTriggered: number;
  lift: number; // how much better tweets are when this rule fires
}

/**
 * Analyzes which rules correlate with high-performing tweets.
 * Uses tracked tweets + metrics to find patterns.
 */
export async function analyzeRulePerformance(userId?: string): Promise<RulePerformance[]> {
  // Get tracked tweets with both reach scores and real metrics
  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;

  const tweets = await prisma.trackedTweet.findMany({
    where,
    include: { metrics: { orderBy: { measuredAt: 'desc' }, take: 1 } },
  });

  // Filter to tweets that have real metrics (views > 0)
  const tweetsWithMetrics = tweets.filter((t) => {
    const m = t.metrics[0];
    return m && m.views > 0;
  });

  if (tweetsWithMetrics.length < 5) {
    return []; // Need minimum 5 tweets with metrics to learn
  }

  // For each tweet, get the analysis record which contains rule_results
  const analyses = await prisma.analysis.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Build rule performance map
  const ruleStats: Record<string, { triggered: number[]; notTriggered: number[] }> = {};

  for (const tweet of tweetsWithMetrics) {
    const m = tweet.metrics[0]!;
    const outcomeScore = calculateOutcomeFromMetrics(m);

    // Find matching analysis by content similarity
    const analysis = analyses.find(
      (a) =>
        a.contentText &&
        tweet.content &&
        a.contentText.substring(0, 50) === tweet.content.substring(0, 50),
    );

    if (!analysis) continue;

    // Parse rule results from analysis
    // v4 rows store the engine's signalScores object in ruleResults. A
    // signal "fired" when it was applicable and moved the score. Older v3
    // rows (an array) have no v4 signals and are skipped.
    const signalScores = analysis.ruleResults as unknown;
    if (!signalScores || typeof signalScores !== 'object' || Array.isArray(signalScores)) continue;

    const firedRules = new Set<string>();
    for (const name of SIGNAL_NAMES) {
      const sig = (signalScores as Record<string, { score?: number; applicable?: boolean }>)[name];
      if (sig && sig.applicable !== false && typeof sig.score === 'number' && sig.score !== 0) {
        firedRules.add(signalRuleId(name));
      }
    }

    for (const ruleId of ALL_RULE_IDS) {
      if (!ruleStats[ruleId]) ruleStats[ruleId] = { triggered: [], notTriggered: [] };
      if (firedRules.has(ruleId)) {
        ruleStats[ruleId].triggered.push(outcomeScore);
      } else {
        ruleStats[ruleId].notTriggered.push(outcomeScore);
      }
    }
  }

  // Calculate performance for each rule
  const results: RulePerformance[] = [];
  for (const [ruleId, stats] of Object.entries(ruleStats)) {
    const avgTriggered =
      stats.triggered.length > 0
        ? stats.triggered.reduce((a, b) => a + b, 0) / stats.triggered.length
        : 0;
    const avgNotTriggered =
      stats.notTriggered.length > 0
        ? stats.notTriggered.reduce((a, b) => a + b, 0) / stats.notTriggered.length
        : 0;

    results.push({
      ruleId,
      timesTriggered: stats.triggered.length,
      avgOutcomeWhenTriggered: Math.round(avgTriggered),
      avgOutcomeWhenNotTriggered: Math.round(avgNotTriggered),
      lift: Math.round(avgTriggered - avgNotTriggered),
    });
  }

  return results.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
}

function calculateOutcomeFromMetrics(m: {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  views: number;
}): number {
  const weighted =
    m.replies * 8 + m.quotes * 6 + m.bookmarks * 5 + m.retweets * 3 + m.likes * 1;
  const views = Math.max(m.views, 1);
  const rate = weighted / views;
  return Math.min(100, Math.max(0, Math.round(20 * Math.log10(rate * 1000 + 1) * 10)));
}

/**
 * Generates personalized weight adjustments based on rule performance data.
 * Returns suggested weight overrides for a user.
 */
export function generateWeightAdjustments(
  performance: RulePerformance[],
): Record<string, number> {
  const adjustments: Record<string, number> = {};

  for (const rule of performance) {
    if (rule.timesTriggered < 3) continue; // Need minimum data

    // Strong positive lift (>10) raises the signal's points, strong negative
    // lift lowers them. The engine applies these (ScoreEngine.setAdjustments).
    if (Math.abs(rule.lift) > 10) {
      adjustments[rule.ruleId] = Math.max(
        -MAX_LEARNED_ADJUSTMENT,
        Math.min(MAX_LEARNED_ADJUSTMENT, Math.round(rule.lift / 5)),
      );
    }
  }

  return adjustments;
}
