import type { RuleSeverity, TextHighlight } from './rules';

export interface ScoreBreakdown {
  /** 0 to 30 */
  hook: number;
  /** 0 to 20 */
  structure: number;
  /** 0 to 30 */
  engagement: number;
  /** -55 to 0 */
  penalties: number;
  /** 0 to 15 */
  bonuses: number;
}

export type ScoreTier = 'critical' | 'below_average' | 'good' | 'excellent' | 'perfect';

export interface Suggestion {
  ruleId: string;
  severity: RuleSeverity;
  title: string;
  description: string;
  highlight?: TextHighlight;
}

/** A single trending topic from X */
export interface TrendingTopic {
  /** Trend name (e.g. "#AI", "ChatGPT", "Super Bowl") */
  name: string;
  /** Cleaned keyword for matching (lowercase, no #) */
  keyword: string;
  /** Rank position (1 = top trend) */
  rank: number;
  /** Tweet volume if available */
  tweetVolume: number | null;
}

/** Result of checking tweet text against trending topics */
export interface TrendingAlignment {
  /** Whether any trending topic was found in the text */
  isAligned: boolean;
  /** Matched trending topics (could be multiple) */
  matchedTrends: TrendingTopic[];
  /** Bonus points added to score */
  bonusPoints: number;
}

export interface AnalysisResult {
  reachScore: number;
  tier: ScoreTier;
  breakdown: ScoreBreakdown;
  aiSlopScore: number | null;
  suggestions: Suggestion[];
  highlights: TextHighlight[];
  isServerEnhanced: boolean;
  /** Trending topic alignment data (only present when server-enhanced) */
  trendingAlignment?: TrendingAlignment | null;
}

// ---------------------------------------------------------------------------
// Reach Forecast & What-If Scenarios
// ---------------------------------------------------------------------------

export interface WhatIfScenario {
  /** Unique key for this scenario */
  id: string;
  /** Human-readable label */
  label: string;
  /** Short description of the change */
  description: string;
  /** Icon/emoji for display */
  icon: string;
  /** Predicted reach with this change applied */
  predictedReach: number;
  /** Absolute delta from current prediction */
  delta: number;
  /** Percentage improvement */
  deltaPercent: number;
  /** Whether this scenario can be "applied" (e.g. remove link is actionable, add media is a suggestion) */
  actionable: boolean;
  /** Whether this scenario is already the current state (e.g. media already present) */
  alreadyApplied: boolean;
}

export interface ReachForecast {
  /** Estimated impressions (point estimate) */
  predictedReach: number;
  /** Lower bound of confidence interval */
  reachLow: number;
  /** Upper bound of confidence interval */
  reachHigh: number;
  /** Ratio vs user's average (e.g. 1.8 = "1.8x your average") */
  vsAverage: number;
  /** Reply probability 0-100 */
  replyProbability: number;
  /** Bookmark probability 0-100 */
  bookmarkProbability: number;
  /** Viral breakout chance 0-100 (score >= 80 + trending + peak time) */
  viralChance: number;
  /** What-if scenarios showing impact of changes */
  scenarios: WhatIfScenario[];
  /** Confidence level 0-1 based on amount of historical data */
  confidence: number;
  /** Number of tracked tweets used to build the baseline */
  dataPoints: number;
  /** Whether we're using real data or follower-based estimate */
  isEstimate: boolean;
}
