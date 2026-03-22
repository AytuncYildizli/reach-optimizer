import { prisma } from './db';
import { calculateOutcomeScore } from './outcome-scorer';
import pg from 'pg';

// -- Types --

export interface CalibrationDataPoint {
  tweetId: string;
  content: string;
  predictedScore: number;
  outcomeScore: number;
  delta: number;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
    views: number;
  };
}

export interface RuleLiftAnalysis {
  ruleId: string;
  ruleName: string;
  category: string;
  timesTriggered: number;
  timesNotTriggered: number;
  avgOutcomeWhenTriggered: number;
  avgOutcomeWhenNotTriggered: number;
  lift: number;
  liftPercent: number;
  pValue: number | null; // null when sample too small for significance
  verdict: 'predictive' | 'noise' | 'harmful' | 'insufficient_data';
}

export interface CalibrationReport {
  status: 'ready' | 'need_more_data';
  message: string;
  dataPointCount: number;
  correlation: {
    pearson: number;
    interpretation: string;
    meanPredicted: number;
    meanOutcome: number;
    bias: number; // positive = we overpredict, negative = we underpredict
    biasLabel: string;
  } | null;
  dataPoints: CalibrationDataPoint[];
  ruleLift: RuleLiftAnalysis[];
  topPredictiveRules: RuleLiftAnalysis[];
  topNoiseRules: RuleLiftAnalysis[];
  topHarmfulRules: RuleLiftAnalysis[];
  calibratedWeights: Record<string, number>;
  dataSources: {
    trackedTweets: number;
    opsTweets: number;
  };
}

// All known rule IDs with metadata
const ALL_RULES: Array<{ id: string; name: string; category: string }> = [
  { id: 'hook-generic-pattern', name: 'Generic Hook Pattern', category: 'hook' },
  { id: 'hook-length-check', name: 'Hook Length Check', category: 'structure' },
  { id: 'hook-number-data', name: 'Number/Data in Hook', category: 'hook' },
  { id: 'hook-multi-sentence', name: 'Multi-Sentence Hook', category: 'hook' },
  { id: 'hook-open-loop', name: 'Open Loop Hook', category: 'hook' },
  { id: 'hook-contrarian-claim', name: 'Contrarian Claim', category: 'hook' },
  { id: 'hook-story-opener', name: 'Story Opener', category: 'hook' },
  { id: 'structure-char-length', name: 'Character Length', category: 'structure' },
  { id: 'structure-thread-length', name: 'Thread Length', category: 'structure' },
  { id: 'engagement-cta-presence', name: 'CTA Presence', category: 'engagement' },
  { id: 'engagement-question-type', name: 'Question Type', category: 'engagement' },
  { id: 'engagement-bookmark-value', name: 'Bookmark Value', category: 'engagement' },
  { id: 'engagement-choice-question', name: 'Choice Question', category: 'engagement' },
  { id: 'engagement-direct-address', name: 'Direct Address', category: 'engagement' },
  { id: 'penalty-link-external', name: 'External Link', category: 'penalty' },
  { id: 'penalty-engagement-bait', name: 'Engagement Bait', category: 'penalty' },
  { id: 'penalty-text-wall', name: 'Text Wall', category: 'penalty' },
  { id: 'penalty-hashtag-spam', name: 'Hashtag Spam', category: 'penalty' },
  { id: 'penalty-emoji-spam', name: 'Emoji Spam', category: 'penalty' },
  { id: 'penalty-dead-ending', name: 'Dead Ending', category: 'penalty' },
  { id: 'penalty-combative-tone', name: 'Combative Tone', category: 'penalty' },
  { id: 'penalty-ai-slop-words', name: 'AI Slop Words', category: 'penalty' },
  { id: 'penalty-ai-slop-structure', name: 'AI Slop Structure', category: 'penalty' },
  { id: 'penalty-stale-formula', name: 'Stale Formula', category: 'penalty' },
  { id: 'penalty-hedging-opener', name: 'Hedging Opener', category: 'penalty' },
  { id: 'penalty-grammar', name: 'Grammar Issues', category: 'penalty' },
  { id: 'bonus-first-person', name: 'First-Person Voice', category: 'bonus' },
  { id: 'bonus-specific-number', name: 'Specific Number', category: 'bonus' },
  { id: 'bonus-media-present', name: 'Media Present', category: 'bonus' },
];

// -- Core Functions --

/**
 * Calculate Pearson correlation coefficient between two arrays.
 * Returns value between -1 and 1.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denomX = Math.sqrt(n * sumX2 - sumX * sumX);
  const denomY = Math.sqrt(n * sumY2 - sumY * sumY);

  if (denomX === 0 || denomY === 0) return 0;
  return numerator / (denomX * denomY);
}

/**
 * Simple two-sample t-test p-value approximation.
 * Returns null if sample sizes are too small (< 3 per group).
 */
function twoSamplePValue(group1: number[], group2: number[]): number | null {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 < 3 || n2 < 3) return null;

  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;

  const var1 = group1.reduce((acc, v) => acc + (v - mean1) ** 2, 0) / (n1 - 1);
  const var2 = group2.reduce((acc, v) => acc + (v - mean2) ** 2, 0) / (n2 - 1);

  const pooledSE = Math.sqrt(var1 / n1 + var2 / n2);
  if (pooledSE === 0) return null;

  const t = Math.abs(mean1 - mean2) / pooledSE;
  const df = Math.min(n1, n2) - 1;

  // Rough p-value approximation from t-statistic
  // Using a conservative approximation: p ~ 2 * e^(-0.717 * t - 0.416 * t^2)
  // Good enough for our classification purposes
  const p = Math.min(1, 2 * Math.exp(-0.717 * t - 0.416 * t * t));
  return Math.max(0, Math.min(1, p));
}

function interpretCorrelation(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'Strong positive - scores predict outcomes well' : 'Strong negative - scores inversely predict outcomes (bad)';
  if (abs >= 0.5) return r > 0 ? 'Moderate positive - decent predictive power' : 'Moderate negative - scores somewhat inversely correlated';
  if (abs >= 0.3) return r > 0 ? 'Weak positive - some signal but room for improvement' : 'Weak negative - slight inverse relationship';
  return 'Very weak / no correlation - scoring needs calibration';
}

/**
 * Fetches data points from tracked_tweets + tweet_metrics (our own DB).
 */
async function fetchTrackedTweetDataPoints(): Promise<CalibrationDataPoint[]> {
  const tweets = await prisma.trackedTweet.findMany({
    include: {
      metrics: { orderBy: { measuredAt: 'desc' }, take: 1 },
    },
    orderBy: { postedAt: 'desc' },
    take: 200,
  });

  const points: CalibrationDataPoint[] = [];

  for (const tweet of tweets) {
    const m = tweet.metrics[0];
    if (!m || m.views < 10) continue; // Skip tweets with negligible views

    const outcomeScore = calculateOutcomeScore({
      likes: m.likes,
      retweets: m.retweets,
      replies: m.replies,
      quotes: m.quotes,
      bookmarks: m.bookmarks,
      views: m.views,
    });

    points.push({
      tweetId: tweet.id,
      content: tweet.content,
      predictedScore: tweet.reachScore,
      outcomeScore,
      delta: outcomeScore - tweet.reachScore,
      metrics: {
        likes: m.likes,
        retweets: m.retweets,
        replies: m.replies,
        quotes: m.quotes,
        bookmarks: m.bookmarks,
        views: m.views,
      },
    });
  }

  return points;
}

/**
 * Fetches data points from ops DB (yellow-jacket) for tweets with
 * both a rating (predicted score) and engagement metrics.
 */
async function fetchOpsDataPoints(): Promise<CalibrationDataPoint[]> {
  const opsUrl = process.env.OPS_DATABASE_URL;
  if (!opsUrl) return [];

  const points: CalibrationDataPoint[] = [];

  try {
    const client = new pg.Client({ connectionString: opsUrl });
    await client.connect();

    // Query tweets that have both a rating (our predicted score) and engagement data
    const { rows } = await client.query<{
      id: number;
      tweet_text: string;
      rating: number;
      likes: number | null;
      retweets: number | null;
      replies: number | null;
      quotes: number | null;
      bookmarks: number | null;
      views: number | null;
    }>(`
      SELECT id, tweet_text, rating,
             COALESCE(likes, 0) as likes,
             COALESCE(retweets, 0) as retweets,
             COALESCE(replies, 0) as replies,
             COALESCE(quotes, 0) as quotes,
             COALESCE(bookmarks, 0) as bookmarks,
             COALESCE(views, 0) as views
      FROM tweets
      WHERE rating IS NOT NULL
        AND (views > 0 OR likes > 0 OR retweets > 0 OR replies > 0)
      ORDER BY created_at DESC
      LIMIT 500
    `);

    for (const row of rows) {
      const likes = row.likes ?? 0;
      const retweets = row.retweets ?? 0;
      const replies = row.replies ?? 0;
      const quotes = row.quotes ?? 0;
      const bookmarks = row.bookmarks ?? 0;
      const views = row.views ?? 0;

      if (views < 10 && likes === 0 && retweets === 0) continue;

      const outcomeScore = calculateOutcomeScore({
        likes,
        retweets,
        replies,
        quotes,
        bookmarks,
        views: Math.max(views, 1),
      });

      points.push({
        tweetId: `ops-${row.id}`,
        content: row.tweet_text || '',
        predictedScore: row.rating,
        outcomeScore,
        delta: outcomeScore - row.rating,
        metrics: { likes, retweets, replies, quotes, bookmarks, views },
      });
    }

    await client.end();
  } catch (error) {
    console.error('[Calibration] Ops DB error:', error);
  }

  return points;
}

/**
 * Analyze rule lift by re-evaluating each rule against tweet content
 * and correlating with actual outcome scores.
 */
async function analyzeRuleLift(
  dataPoints: CalibrationDataPoint[],
): Promise<RuleLiftAnalysis[]> {
  // We need rule results from the analysis table for each data point.
  // For ops data points without analysis records, we'll re-run rules client-side.
  // But since we can't import the rules engine here (it's a separate package),
  // we'll rely on the analyses table for tracked tweets AND use the
  // analysis records matched by content for ops tweets.

  const analyses = await prisma.analysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      contentText: true,
      ruleResults: true,
      suggestions: true,
    },
  });

  // Build a content -> rule results lookup (first 60 chars as key)
  const contentToRules = new Map<string, Set<string>>();
  for (const analysis of analyses) {
    const key = (analysis.contentText || '').substring(0, 60).trim().toLowerCase();
    if (!key) continue;

    // Extract fired rule IDs from ruleResults or suggestions
    const firedRules = new Set<string>();

    // Try ruleResults first (newer format)
    const ruleResults = analysis.ruleResults as Array<{ ruleId?: string; triggered?: boolean }> | null;
    if (Array.isArray(ruleResults)) {
      for (const r of ruleResults) {
        if (r.ruleId && r.triggered) firedRules.add(r.ruleId);
      }
    }

    // Also check suggestions (older format - suggestions only contain triggered rules)
    const suggestions = analysis.suggestions as Array<{ ruleId?: string }> | null;
    if (Array.isArray(suggestions)) {
      for (const s of suggestions) {
        if (s.ruleId) firedRules.add(s.ruleId);
      }
    }

    if (firedRules.size > 0) {
      contentToRules.set(key, firedRules);
    }
  }

  // For each rule, collect outcome scores when triggered vs not triggered
  const ruleStats: Record<string, { triggered: number[]; notTriggered: number[] }> = {};

  for (const rule of ALL_RULES) {
    ruleStats[rule.id] = { triggered: [], notTriggered: [] };
  }

  for (const dp of dataPoints) {
    const key = dp.content.substring(0, 60).trim().toLowerCase();
    const firedRules = contentToRules.get(key);

    if (!firedRules) continue; // No analysis record for this tweet

    for (const rule of ALL_RULES) {
      if (firedRules.has(rule.id)) {
        ruleStats[rule.id].triggered.push(dp.outcomeScore);
      } else {
        ruleStats[rule.id].notTriggered.push(dp.outcomeScore);
      }
    }
  }

  // Calculate lift for each rule
  const results: RuleLiftAnalysis[] = [];

  for (const rule of ALL_RULES) {
    const stats = ruleStats[rule.id];
    const avgTriggered =
      stats.triggered.length > 0
        ? stats.triggered.reduce((a, b) => a + b, 0) / stats.triggered.length
        : 0;
    const avgNotTriggered =
      stats.notTriggered.length > 0
        ? stats.notTriggered.reduce((a, b) => a + b, 0) / stats.notTriggered.length
        : 0;

    const lift = avgTriggered - avgNotTriggered;
    const liftPercent =
      avgNotTriggered > 0
        ? ((avgTriggered - avgNotTriggered) / avgNotTriggered) * 100
        : 0;

    const pValue = twoSamplePValue(stats.triggered, stats.notTriggered);

    let verdict: RuleLiftAnalysis['verdict'];
    if (stats.triggered.length < 3 || stats.notTriggered.length < 3) {
      verdict = 'insufficient_data';
    } else if (pValue !== null && pValue > 0.1) {
      verdict = 'noise'; // Not statistically significant
    } else if (lift > 5) {
      verdict = 'predictive';
    } else if (lift < -5) {
      verdict = 'harmful';
    } else {
      verdict = 'noise';
    }

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      timesTriggered: stats.triggered.length,
      timesNotTriggered: stats.notTriggered.length,
      avgOutcomeWhenTriggered: Math.round(avgTriggered * 10) / 10,
      avgOutcomeWhenNotTriggered: Math.round(avgNotTriggered * 10) / 10,
      lift: Math.round(lift * 10) / 10,
      liftPercent: Math.round(liftPercent * 10) / 10,
      pValue: pValue !== null ? Math.round(pValue * 1000) / 1000 : null,
      verdict,
    });
  }

  return results.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
}

/**
 * Generate calibrated weights based on rule lift analysis.
 * Maps real-world lift data to weight multipliers.
 */
function generateCalibratedWeights(
  ruleLift: RuleLiftAnalysis[],
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const rule of ruleLift) {
    if (rule.verdict === 'insufficient_data') continue;

    // Base weight adjustment: proportional to lift
    // Rules with high positive lift get boosted, negative lift get dampened
    if (rule.verdict === 'predictive') {
      // Positive lift: scale weight up (1.2x to 2.0x based on lift magnitude)
      const multiplier = Math.min(2.0, 1.0 + rule.lift / 50);
      weights[rule.ruleId] = Math.round(multiplier * 100) / 100;
    } else if (rule.verdict === 'harmful') {
      // Negative lift: reduce weight (0.3x to 0.8x)
      const multiplier = Math.max(0.3, 1.0 + rule.lift / 50);
      weights[rule.ruleId] = Math.round(multiplier * 100) / 100;
    } else {
      // Noise rules: slightly dampen (0.7x to 0.9x)
      weights[rule.ruleId] = 0.8;
    }
  }

  return weights;
}

/**
 * Main function: generate a complete calibration report.
 */
export async function generateCalibrationReport(): Promise<CalibrationReport> {
  // 1. Fetch data from both sources
  const [trackedPoints, opsPoints] = await Promise.all([
    fetchTrackedTweetDataPoints(),
    fetchOpsDataPoints(),
  ]);

  const allPoints = [...trackedPoints, ...opsPoints];

  // 2. Check minimum data threshold
  if (allPoints.length < 10) {
    return {
      status: 'need_more_data',
      message: `Only ${allPoints.length} tweets with both predicted scores and engagement data. Need at least 10 for meaningful calibration. Track more tweets and wait for metrics to accumulate.`,
      dataPointCount: allPoints.length,
      correlation: null,
      dataPoints: allPoints,
      ruleLift: [],
      topPredictiveRules: [],
      topNoiseRules: [],
      topHarmfulRules: [],
      calibratedWeights: {},
      dataSources: {
        trackedTweets: trackedPoints.length,
        opsTweets: opsPoints.length,
      },
    };
  }

  // 3. Calculate Pearson correlation
  const predicted = allPoints.map((p) => p.predictedScore);
  const actual = allPoints.map((p) => p.outcomeScore);
  const r = pearsonCorrelation(predicted, actual);

  const meanPredicted = predicted.reduce((a, b) => a + b, 0) / predicted.length;
  const meanOutcome = actual.reduce((a, b) => a + b, 0) / actual.length;
  const bias = meanPredicted - meanOutcome;

  let biasLabel: string;
  if (Math.abs(bias) <= 5) biasLabel = 'Well-calibrated';
  else if (bias > 15) biasLabel = 'Significantly overpredicting';
  else if (bias > 5) biasLabel = 'Slightly overpredicting';
  else if (bias < -15) biasLabel = 'Significantly underpredicting';
  else biasLabel = 'Slightly underpredicting';

  // 4. Analyze rule lift
  const ruleLift = await analyzeRuleLift(allPoints);

  // 5. Classify rules
  const topPredictiveRules = ruleLift
    .filter((r) => r.verdict === 'predictive')
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 5);

  const topNoiseRules = ruleLift
    .filter((r) => r.verdict === 'noise')
    .sort((a, b) => Math.abs(a.lift) - Math.abs(b.lift))
    .slice(0, 5);

  const topHarmfulRules = ruleLift
    .filter((r) => r.verdict === 'harmful')
    .sort((a, b) => a.lift - b.lift)
    .slice(0, 5);

  // 6. Generate calibrated weights
  const calibratedWeights = generateCalibratedWeights(ruleLift);

  return {
    status: 'ready',
    message: `Calibration report based on ${allPoints.length} tweets (${trackedPoints.length} tracked + ${opsPoints.length} from ops). Pearson r = ${r.toFixed(3)}.`,
    dataPointCount: allPoints.length,
    correlation: {
      pearson: Math.round(r * 1000) / 1000,
      interpretation: interpretCorrelation(r),
      meanPredicted: Math.round(meanPredicted * 10) / 10,
      meanOutcome: Math.round(meanOutcome * 10) / 10,
      bias: Math.round(bias * 10) / 10,
      biasLabel,
    },
    dataPoints: allPoints,
    ruleLift,
    topPredictiveRules,
    topNoiseRules,
    topHarmfulRules,
    calibratedWeights,
    dataSources: {
      trackedTweets: trackedPoints.length,
      opsTweets: opsPoints.length,
    },
  };
}
