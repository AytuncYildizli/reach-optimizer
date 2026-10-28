/**
 * Per-account reach model for Draftroom.
 *
 * A range is present only when a time-ordered holdout beat the account's
 * rolling-median impressions. Otherwise the caller gets status "withheld"
 * and no reach numbers. This layer never rewrites text and never posts.
 */

export interface ReachRange {
  /** Inclusive impression bounds. Low is never above high. */
  low: number;
  high: number;
}

export interface ReachFactor {
  /** Human label, such as "image" or "time of day". */
  name: string;
  /**
   * Signed contribution in log-impression space versus the training mean
   * of this feature. Positive means this draft's value is associated with
   * higher reach in the fit.
   */
  contribution: number;
  direction: 'higher' | 'lower';
}

export interface ReachSuggestion {
  id: string;
  /** A change the owner can make. Not a rewritten draft. */
  text: string;
  /** Alternative range after that change. Null when numbers are withheld. */
  range: ReachRange | null;
}

export interface AccountReachValidation {
  passed: boolean;
  reason: string;
  trainN: number;
  testN: number;
  spearman: number | null;
  mae: number | null;
  baselineSpearman: number | null;
  baselineMae: number | null;
  maeLog: number | null;
  baselineMaeLog: number | null;
  /** Share of held-out posts whose impressions fell inside the 80% range. */
  coverage80: number | null;
}

export interface AccountReachModel {
  kind: 'account-log-impressions';
  version: 1;
  status: 'calibrated' | 'uncalibrated';
  reason: string;
  account: string;
  /** IANA zone used for hour and weekday features. Scoring must keep it. */
  timezone: string;
  trainedAt: string;
  /**
   * Study config chosen on the training slice. The holdout only decides
   * `status`. Weights are stored either way.
   */
  config: string;
  /** How to turn the linear predictor back into impressions. */
  predictTarget: 'relative' | 'absolute' | 'ewma';
  loss: 'squared' | 'huber' | 'gbt' | 'none';
  /** Multiplier on the log-ratio before exp. 1 when the config does not shrink. */
  shrinkK: number;
  featureNames: string[];
  mean: number[];
  std: number[];
  /** Standardized ridge weights. Empty for an EWMA or tree config. Present even when the gate fails. */
  weights: number[];
  intercept: number;
  /** Gradient-boosted trees when `loss` is `gbt`. */
  boost: {
    mean: number;
    learningRate: number;
    trees: unknown[];
  } | null;
  /** 10th and 90th percentile of training-slice log-impression residuals. */
  residualQ10: number;
  residualQ90: number;
  lambda: number;
  /**
   * Rolling median of the latest eligible posts. This is the naive baseline
   * the gate compares against.
   */
  baselineImpressions: number | null;
  baselineEngagement: number | null;
  ewmaByKind: { original: number | null; quote: number | null; reply: number | null };
  latestPostAt: string | null;
  recentPostAts: string[];
  recentTopics: string[];
  /** Largest |standardized weights| of the shipped fit. */
  topWeights: Array<{ name: string; weight: number }>;
  /** Train-slice comparison that chose `config`. The holdout is not in this table. */
  selection: Array<{ config: string; maeGain: number | null; spearman: number | null; detail: string }>;
  /** Self-replies already in the open 6h burst. A new self-reply uses this plus one. */
  trailingSelfReplies: number;
  /**
   * Logistic head for P(impressions > 3× baseline). Present only when the
   * holdout AUC is above 0.65. Absent means the probability is not shown.
   */
  breakout: {
    featureNames: string[];
    mean: number[];
    std: number[];
    weights: number[];
    intercept: number;
    auc: number;
    brier: number;
  } | null;
  validation: AccountReachValidation;
}

export interface DraftScoreMeta {
  model?: AccountReachModel | null;
  hasMedia?: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll' | null;
  isQuote?: boolean;
  isThread?: boolean;
  /** Scoring clock. ISO string or Date. Defaults to the current time. */
  now?: Date | string;
}

/**
 * Stable Draftroom result. `range` is null whenever status is withheld,
 * including on suggestions.
 */
export interface DraftScore {
  status: 'scored' | 'withheld';
  range: ReachRange | null;
  /**
   * 0 when withheld. Otherwise the holdout 80% coverage, scaled down when
   * the holdout has fewer than 40 posts.
   */
  confidence: number;
  topFactors: ReachFactor[];
  suggestions: ReachSuggestion[];
  /**
   * P(impressions > 3× the account's rolling median). Null unless a head
   * fit on older posts has holdout AUC above 0.65, and the impression gate passed.
   */
  breakoutProbability: number | null;
  reason: string;
}
