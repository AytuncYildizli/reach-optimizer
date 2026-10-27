/**
 * Per-account reach model. Coefficients are present only when a time-ordered
 * holdout beat the account's rolling-median baseline. Otherwise the product
 * shows the checklist and an uncalibrated forecast.
 */

export interface FittedTargetModel {
  target: 'log_impression_ratio' | 'engagement_residual';
  featureNames: string[];
  /** Train-set mean of each feature, aligned with featureNames. */
  mean: number[];
  /** Train-set population standard deviation. */
  std: number[];
  /** Weights on standardized features. */
  weights: number[];
  intercept: number;
  /**
   * 10th and 90th percentiles of held-in validation residuals
   * (actual − predicted) in target space. An 80% interval is
   * prediction + these quantiles.
   */
  residualQ10: number;
  residualQ90: number;
  lambda: number;
}

export interface TargetValidation {
  passed: boolean;
  reason: string;
  testN: number;
  trainN: number;
  spearman: number | null;
  mae: number | null;
  medianAe: number | null;
  baselineSpearman: number | null;
  baselineMae: number | null;
  baselineMedianAe: number | null;
  /** Checklist score mapped through the old multiplier chain. Null for engagement. */
  heuristicSpearman: number | null;
  heuristicMae: number | null;
  /** Raw 0–100 checklist score vs the target, on the time-held-out posts. */
  checklistSpearman: number | null;
  /** Fraction of holdout posts inside the 80% interval. */
  coverage80: number | null;
  /** MAE of log impressions. Null for the engagement target. */
  maeLog: number | null;
  baselineMaeLog: number | null;
}

export interface ReachModelSnapshot {
  version: 1;
  status: 'calibrated' | 'uncalibrated';
  reason: string;
  trainedAt: string;
  /** IANA zone used for hour/day features. Prediction must use this same zone. */
  timezone: string;
  eligiblePosts: number;
  modeledPosts: number;
  trainPosts: number;
  testPosts: number;
  /** Rolling median a new post would be compared against. */
  baselineImpressions: number | null;
  baselineEngagement: number | null;
  latestPostAt: string | null;
  /** Timestamps of recent eligible posts, oldest first, for recency features. */
  recentPostAts: string[];
  /** Keyword bag from recent posts, for the topic-consistency signal. */
  recentTopics: string[];
  impressions: FittedTargetModel | null;
  engagement: FittedTargetModel | null;
  validation: {
    impressions: TargetValidation;
    engagement: TargetValidation;
  };
}
