import { prisma } from './db';

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
    const suggestions = (analysis.suggestions as Array<{ ruleId?: string }>) || [];

    // Track which rules fired
    const firedRules = new Set(suggestions.map((s) => s.ruleId).filter(Boolean));

    // All known rule IDs
    const allRuleIds = [
      'hook-generic-pattern',
      'hook-length-check',
      'hook-number-data',
      'hook-multi-sentence',
      'hook-open-loop',
      'hook-contrarian-claim',
      'hook-story-opener',
      'structure-char-length',
      'penalty-hashtag-spam',
      'penalty-emoji-spam',
      'structure-thread-length',
      'engagement-cta-presence',
      'engagement-question-type',
      'engagement-bookmark-value',
      'engagement-choice-question',
      'engagement-direct-address',
      'penalty-link-external',
      'penalty-engagement-bait',
      'penalty-text-wall',
      'penalty-dead-ending',
      'penalty-combative-tone',
      'penalty-ai-slop-words',
      'penalty-ai-slop-structure',
      'penalty-stale-formula',
      'penalty-hedging-opener',
      'bonus-first-person',
      'bonus-specific-number',
    ];

    for (const ruleId of allRuleIds) {
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

    // If a rule has strong positive lift (>10), increase its weight
    // If negative lift, decrease
    if (rule.lift > 10) {
      adjustments[rule.ruleId] = Math.round(rule.lift / 5); // +2 to +6
    } else if (rule.lift < -10) {
      adjustments[rule.ruleId] = Math.round(rule.lift / 5); // -2 to -6
    }
  }

  return adjustments;
}
