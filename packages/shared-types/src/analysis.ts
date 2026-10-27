import type {
  RuleSeverity,
  SignalName,
  SignalScore,
  TextHighlight,
} from './rules';

export type ScoreTier = 'critical' | 'below_average' | 'good' | 'excellent' | 'perfect';

export interface Suggestion {
  signal?: SignalName;
  ruleId: string;
  severity: RuleSeverity;
  title: string;
  description: string;
  highlight?: TextHighlight;
}

export interface TrendingTopic {
  name: string;
  keyword: string;
  rank: number;
  tweetVolume: number | null;
}

export interface TrendingAlignment {
  isAligned: boolean;
  matchedTrends: TrendingTopic[];
  bonusPoints: number;
}

export interface AnalysisResult {
  score: number;
  baseScore: number;
  tier: ScoreTier;
  signalScores: Record<SignalName, SignalScore>;
  applicableSignals: SignalName[];
  aiSlopScore: number | null;
  suggestions: Suggestion[];
  highlights: TextHighlight[];
  isServerEnhanced: boolean;
  trendingAlignment?: TrendingAlignment | null;
}

export interface WhatIfScenario {
  id: string;
  label: string;
  description: string;
  icon: string;
  predictedReach: number;
  delta: number;
  deltaPercent: number;
  actionable: boolean;
  alreadyApplied: boolean;
}

export interface ReachForecast {
  /**
   * `calibrated` only when this account's model beat its rolling-median
   * reach on newer held-out posts. Otherwise no reach number is shown.
   */
  status: 'calibrated' | 'uncalibrated';
  /** Point estimate. Null when uncalibrated. */
  predictedReach: number | null;
  /** Lower end of the 80% interval. Null when uncalibrated. */
  reachLow: number | null;
  /** Upper end of the 80% interval. Null when uncalibrated. */
  reachHigh: number | null;
  vsAverage: number | null;
  /** Predicted engagement rate (0–1). Null when that model did not pass. */
  engagementRate: number | null;
  engagementLow: number | null;
  engagementHigh: number | null;
  scenarios: WhatIfScenario[];
  /** Holdout coverage of the 80% interval. 0 when uncalibrated. */
  confidence: number;
  dataPoints: number;
  isEstimate: boolean;
  /** Why a number is or is not shown. */
  reason: string;
}
