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

export interface AnalysisResult {
  reachScore: number;
  tier: ScoreTier;
  breakdown: ScoreBreakdown;
  aiSlopScore: number | null;
  suggestions: Suggestion[];
  highlights: TextHighlight[];
  isServerEnhanced: boolean;
}
