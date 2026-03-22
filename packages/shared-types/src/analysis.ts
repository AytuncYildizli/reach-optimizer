import type { RuleSeverity, TextHighlight } from './rules';

export interface ScoreBreakdown {
  /** 0 to 25 */
  hook: number;
  /** 0 to 20 */
  structure: number;
  /** 0 to 20 */
  engagement: number;
  /** 0 to -30 */
  penalties: number;
  /** 0 to +15 */
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
