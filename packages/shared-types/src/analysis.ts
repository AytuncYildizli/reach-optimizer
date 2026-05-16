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
  predictedReach: number;
  reachLow: number;
  reachHigh: number;
  vsAverage: number;
  replyProbability: number;
  bookmarkProbability: number;
  viralChance: number;
  scenarios: WhatIfScenario[];
  confidence: number;
  dataPoints: number;
  isEstimate: boolean;
}
