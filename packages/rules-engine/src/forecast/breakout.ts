import type { ModelRow } from './dataset';
import { fitLogisticRidge, predictLogistic } from './ridge';
import { auc, brier } from './stats';

/** A post is a breakout when impressions exceed 3× the rolling median known at compose time. */
export const BREAKOUT_MULTIPLE = 3;
export const BREAKOUT_AUC_MIN = 0.65;

export function breakoutLabel(row: Pick<ModelRow, 'impressions' | 'baselineImpressions'>): number {
  return row.impressions > BREAKOUT_MULTIPLE * row.baselineImpressions ? 1 : 0;
}

export interface BreakoutHead {
  featureNames: string[];
  mean: number[];
  std: number[];
  weights: number[];
  intercept: number;
  auc: number;
  brier: number;
}

/**
 * Fit on older rows and score the sealed newer rows. The head is returned
 * only when holdout AUC is above 0.65. Otherwise the probability is not shown.
 */
export function fitBreakoutHead(train: ModelRow[], test: ModelRow[], featureNames: string[], lambda: number): BreakoutHead | null {
  if (train.length < 20 || test.length < 10 || featureNames.length === 0) return null;
  const design = (rows: ModelRow[]) => rows.map((row) => featureNames.map((name) => row.features[name] ?? 0));
  const model = fitLogisticRidge(design(train), train.map(breakoutLabel), lambda > 0 ? lambda : 1);
  if (!model) return null;
  const scores = predictLogistic(model, design(test));
  const labels = test.map(breakoutLabel);
  const holdoutAuc = auc(scores, labels);
  const holdoutBrier = brier(scores, labels);
  if (holdoutAuc == null || holdoutBrier == null || !(holdoutAuc > BREAKOUT_AUC_MIN)) return null;
  return {
    featureNames,
    mean: model.mean,
    std: model.std,
    weights: model.weights,
    intercept: model.intercept,
    auc: holdoutAuc,
    brier: holdoutBrier,
  };
}
