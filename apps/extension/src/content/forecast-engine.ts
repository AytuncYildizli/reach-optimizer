import type { AnalysisResult, AccountHealth, ReachForecast, WhatIfScenario } from '@reach/shared-types';

// ---------------------------------------------------------------------------
// Reach Forecast Engine — client-side prediction model
// ---------------------------------------------------------------------------

interface ForecastInput {
  analysis: AnalysisResult;
  accountHealth: AccountHealth | null;
  timingStatus: 'good_now' | 'better_later' | 'off_peak' | null;
  hasMedia: boolean;
  hasExternalLink: boolean;
  /** Average views from tracked tweets (null = no data) */
  avgViews: number | null;
  /** Number of tracked tweets with metrics */
  trackedTweetCount: number;
}

// Multiplier constants (research-backed from algorithm analysis)
const MEDIA_MULTIPLIER = 1.38;       // Confirmed 2x Earlybird, real-world ~38% lift
const LINK_PENALTY = 0.55;           // Confirmed 30-50% reach cut
const TRENDING_MULTIPLIER = 1.15;    // Trending alignment boost
const PEAK_TIME_MULTIPLIER = 1.25;   // Peak posting time
const GOOD_TIME_MULTIPLIER = 1.12;   // Good posting time
const OFF_PEAK_MULTIPLIER = 0.85;    // Off-peak posting

// Fallback: if no tracked data, estimate views from follower count
const FOLLOWER_IMPRESSION_RATE = 0.05; // ~5% of followers see an average tweet
const MIN_ESTIMATED_VIEWS = 50;        // Floor for very small accounts

/**
 * Compute a reach forecast from the current analysis state and account data.
 */
export function computeForecast(input: ForecastInput): ReachForecast {
  const {
    analysis,
    accountHealth,
    timingStatus,
    hasMedia,
    hasExternalLink,
    avgViews,
    trackedTweetCount,
  } = input;

  // 1. Base reach — use real data if available, otherwise estimate from followers
  let baseReach: number;
  let isEstimate: boolean;

  if (avgViews !== null && avgViews > 0) {
    baseReach = avgViews;
    isEstimate = false;
  } else if (accountHealth && accountHealth.followerCount > 0) {
    baseReach = Math.max(
      MIN_ESTIMATED_VIEWS,
      Math.round(accountHealth.followerCount * FOLLOWER_IMPRESSION_RATE),
    );
    isEstimate = true;
  } else {
    baseReach = 200; // Generic fallback for unauthenticated users
    isEstimate = true;
  }

  // 2. Content quality multiplier — score maps to reach impact
  // Score 50 = 1.0x (average), score 75 = 1.5x, score 25 = 0.5x
  const contentMultiplier = analysis.reachScore / 50;

  // 3. Timing multiplier
  const timeMultiplier = timingStatus === 'good_now'
    ? PEAK_TIME_MULTIPLIER
    : timingStatus === 'better_later'
      ? GOOD_TIME_MULTIPLIER
      : OFF_PEAK_MULTIPLIER;

  // 4. Trending multiplier
  const isTrending = analysis.trendingAlignment?.isAligned ?? false;
  const trendMultiplier = isTrending ? TRENDING_MULTIPLIER : 1.0;

  // 5. Media multiplier
  const mediaMultiplier = hasMedia ? MEDIA_MULTIPLIER : 1.0;

  // 6. Link penalty
  const linkMultiplier = hasExternalLink ? LINK_PENALTY : 1.0;

  // 7. Account health multiplier
  const healthMultiplier = accountHealth?.reachMultiplier ?? 1.0;

  // 8. Calibration correction (from historical prediction vs actual comparison)
  const calibrationFactor = accountHealth?.forecastCorrectionFactor ?? 1.0;

  // Compute prediction
  const predictedReach = Math.round(
    baseReach * contentMultiplier * timeMultiplier * trendMultiplier
    * mediaMultiplier * linkMultiplier * healthMultiplier * calibrationFactor,
  );

  // Confidence interval — widens with fewer data points
  const confidence = trackedTweetCount > 0
    ? Math.min(trackedTweetCount / 30, 1.0)
    : 0;
  const spreadFactor = 0.45 - 0.3 * confidence; // 0.45 with 0 data → 0.15 with 30+ tweets
  const reachLow = Math.max(1, Math.round(predictedReach * (1 - spreadFactor)));
  const reachHigh = Math.round(predictedReach * (1 + spreadFactor));

  // vs average ratio
  const vsAverage = baseReach > 0 ? predictedReach / baseReach : 1.0;

  // Reply probability based on engagement signals
  const hasQuestion = analysis.suggestions.some(
    s => s.ruleId === 'engagement-cta-presence' && s.severity === 'positive',
  );
  const hasChoiceQuestion = analysis.suggestions.some(
    s => s.ruleId === 'engagement-choice-question' && s.severity === 'positive',
  );
  let replyProbability = 25; // baseline
  if (hasChoiceQuestion) replyProbability += 40;
  else if (hasQuestion) replyProbability += 25;
  if (analysis.reachScore >= 70) replyProbability += 15;
  if (isTrending) replyProbability += 10;
  replyProbability = Math.min(95, replyProbability);

  // Bookmark probability based on content signals
  const hasBookmarkValue = analysis.suggestions.some(
    s => s.ruleId === 'engagement-bookmark-value' && s.severity === 'positive',
  );
  const hasListPromise = analysis.suggestions.some(
    s => s.ruleId === 'hook-list-promise' && s.severity === 'positive',
  );
  let bookmarkProbability = 10; // baseline
  if (hasBookmarkValue) bookmarkProbability += 30;
  if (hasListPromise) bookmarkProbability += 15;
  if (analysis.reachScore >= 75) bookmarkProbability += 10;
  bookmarkProbability = Math.min(85, bookmarkProbability);

  // Viral breakout chance
  let viralChance = 2; // baseline — most tweets don't go viral
  if (analysis.reachScore >= 85) viralChance += 12;
  else if (analysis.reachScore >= 75) viralChance += 6;
  if (isTrending) viralChance += 8;
  if (timingStatus === 'good_now') viralChance += 4;
  if (hasMedia) viralChance += 3;
  if (hasExternalLink) viralChance = Math.max(1, viralChance - 5);
  viralChance = Math.min(40, viralChance);

  // 8. Build what-if scenarios
  const scenarios = buildScenarios(input, predictedReach);

  return {
    predictedReach,
    reachLow,
    reachHigh,
    vsAverage: Math.round(vsAverage * 10) / 10,
    replyProbability,
    bookmarkProbability,
    viralChance,
    scenarios,
    confidence,
    dataPoints: trackedTweetCount,
    isEstimate,
  };
}

/**
 * Build what-if scenarios by toggling each variable.
 */
function buildScenarios(
  input: ForecastInput,
  currentPrediction: number,
): WhatIfScenario[] {
  const scenarios: WhatIfScenario[] = [];

  // Scenario: Remove external link (only if link exists)
  if (input.hasExternalLink) {
    const withoutLink = recompute(input, { hasExternalLink: false });
    scenarios.push({
      id: 'remove-link',
      label: 'Remove the link',
      description: 'Move link to first reply',
      icon: '\uD83D\uDD17',
      predictedReach: withoutLink,
      delta: withoutLink - currentPrediction,
      deltaPercent: Math.round(((withoutLink - currentPrediction) / currentPrediction) * 100),
      actionable: true,
      alreadyApplied: false,
    });
  }

  // Scenario: Add media (only if no media)
  if (!input.hasMedia) {
    const withMedia = recompute(input, { hasMedia: true });
    scenarios.push({
      id: 'add-media',
      label: 'Add an image',
      description: 'Confirmed 2x algorithm boost',
      icon: '\uD83D\uDDBC\uFE0F',
      predictedReach: withMedia,
      delta: withMedia - currentPrediction,
      deltaPercent: Math.round(((withMedia - currentPrediction) / currentPrediction) * 100),
      actionable: false,
      alreadyApplied: false,
    });
  } else {
    scenarios.push({
      id: 'add-media',
      label: 'Image attached',
      description: '+38% boost active',
      icon: '\u2705',
      predictedReach: currentPrediction,
      delta: 0,
      deltaPercent: 0,
      actionable: false,
      alreadyApplied: true,
    });
  }

  // Scenario: Post at optimal time (only if not peak)
  if (input.timingStatus !== 'good_now') {
    const atPeakTime = recompute(input, { timingStatus: 'good_now' });
    scenarios.push({
      id: 'optimal-time',
      label: 'Post at peak time',
      description: 'Tue-Fri 9AM-2PM UTC',
      icon: '\u23F0',
      predictedReach: atPeakTime,
      delta: atPeakTime - currentPrediction,
      deltaPercent: Math.round(((atPeakTime - currentPrediction) / currentPrediction) * 100),
      actionable: false,
      alreadyApplied: false,
    });
  } else {
    scenarios.push({
      id: 'optimal-time',
      label: 'Peak posting time',
      description: '+25% boost active',
      icon: '\u2705',
      predictedReach: currentPrediction,
      delta: 0,
      deltaPercent: 0,
      actionable: false,
      alreadyApplied: true,
    });
  }

  // Scenario: Align with trending (only if not trending)
  if (!input.analysis.trendingAlignment?.isAligned) {
    const withTrending = recompute(input, { trending: true });
    scenarios.push({
      id: 'trending',
      label: 'Align with a trend',
      description: 'Mention a trending topic',
      icon: '\uD83D\uDD25',
      predictedReach: withTrending,
      delta: withTrending - currentPrediction,
      deltaPercent: Math.round(((withTrending - currentPrediction) / currentPrediction) * 100),
      actionable: false,
      alreadyApplied: false,
    });
  }

  // Combined "best case" scenario — all improvements applied
  const unapplied = scenarios.filter(s => !s.alreadyApplied);
  if (unapplied.length >= 2) {
    const bestCase = recompute(input, {
      hasExternalLink: false,
      hasMedia: true,
      timingStatus: 'good_now',
      trending: true,
    });
    scenarios.push({
      id: 'combined',
      label: 'All optimizations',
      description: `${unapplied.length} changes combined`,
      icon: '\uD83D\uDE80',
      predictedReach: bestCase,
      delta: bestCase - currentPrediction,
      deltaPercent: Math.round(((bestCase - currentPrediction) / currentPrediction) * 100),
      actionable: false,
      alreadyApplied: false,
    });
  }

  return scenarios;
}

/**
 * Recompute predicted reach with one or more variables toggled.
 */
function recompute(
  input: ForecastInput,
  overrides: {
    hasExternalLink?: boolean;
    hasMedia?: boolean;
    timingStatus?: 'good_now' | 'better_later' | 'off_peak';
    trending?: boolean;
  },
): number {
  const { analysis, accountHealth, avgViews, trackedTweetCount } = input;

  const hasMedia = overrides.hasMedia ?? input.hasMedia;
  const hasExternalLink = overrides.hasExternalLink ?? input.hasExternalLink;
  const timingStatus = overrides.timingStatus ?? input.timingStatus;
  const isTrending = overrides.trending ?? (analysis.trendingAlignment?.isAligned ?? false);

  // Base reach
  let baseReach: number;
  if (avgViews !== null && avgViews > 0) {
    baseReach = avgViews;
  } else if (accountHealth && accountHealth.followerCount > 0) {
    baseReach = Math.max(MIN_ESTIMATED_VIEWS, Math.round(accountHealth.followerCount * FOLLOWER_IMPRESSION_RATE));
  } else {
    baseReach = 200;
  }

  const contentMultiplier = analysis.reachScore / 50;
  const timeMultiplier = timingStatus === 'good_now'
    ? PEAK_TIME_MULTIPLIER
    : timingStatus === 'better_later'
      ? GOOD_TIME_MULTIPLIER
      : OFF_PEAK_MULTIPLIER;
  const trendMultiplier = isTrending ? TRENDING_MULTIPLIER : 1.0;
  const mediaMultiplier = hasMedia ? MEDIA_MULTIPLIER : 1.0;
  const linkMultiplier = hasExternalLink ? LINK_PENALTY : 1.0;
  const healthMultiplier = accountHealth?.reachMultiplier ?? 1.0;
  const calibrationFactor = accountHealth?.forecastCorrectionFactor ?? 1.0;

  return Math.round(
    baseReach * contentMultiplier * timeMultiplier * trendMultiplier
    * mediaMultiplier * linkMultiplier * healthMultiplier * calibrationFactor,
  );
}

/**
 * Format a number with commas (e.g. 14200 → "14,200")
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
