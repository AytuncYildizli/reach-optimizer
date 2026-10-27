import type {
  FittedTargetModel,
  ReachModelSnapshot,
  TargetValidation,
} from '@reach/shared-types';
import type { HistoryPost, ModelRow } from './dataset';
import { prepareDataset } from './dataset';
import { orderedFeatureNames } from './features';
import {
  applyStandardize,
  columnStats,
  dotPredict,
  fitRidgeOnStandardized,
} from './ridge';
import { mae, maeLog, medianAe, quantile, spearman } from './stats';

/** Precommitted gate. Do not relax this after seeing a test set. */
export const MIN_TRAIN = 40;
export const MIN_TEST = 20;
export const MIN_MAE_IMPROVEMENT = 0.05;
export const LAMBDA_GRID = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000, 3000];

export const DEFAULT_WINDOW = 20;
export const DEFAULT_MIN_HISTORY = 8;
export const DEFAULT_TRAIN_FRACTION = 0.7;
export const DEFAULT_MIN_AGE_DAYS = 3;

export interface BacktestOptions {
  timezone?: string;
  asOf?: Date;
  minAgeDays?: number;
  window?: number;
  minHistory?: number;
  trainFraction?: number;
  trainedAt?: Date;
}

export interface HoldoutRow {
  id: string;
  actual: number;
  predicted: number;
  baseline: number;
  heuristic: number | null;
}

export interface TargetReport extends TargetValidation {
  topWeights: Array<{ name: string; weight: number }>;
  holdout: HoldoutRow[];
}

export interface BacktestReport {
  protocol: Record<string, string | number>;
  dropped: Record<string, number>;
  eligiblePosts: number;
  modeledPosts: number;
  span: [string, string] | null;
  checklistAllEligible: {
    n: number;
    impressionsSpearman: number | null;
    engagementSpearman: number | null;
    automatedSpamPosts: number;
  };
  impressions: TargetReport;
  engagement: TargetReport;
  snapshot: ReachModelSnapshot;
}

interface ColumnFit {
  mean: number[];
  std: number[];
  weights: number[];
  intercept: number;
}

function design(rows: ModelRow[], names: string[]): number[][] {
  return rows.map((row) => names.map((name) => row.features[name] ?? 0));
}

function activeNames(rows: ModelRow[], names: string[]): string[] {
  if (rows.length === 0) return [];
  const { std } = columnStats(design(rows, names));
  return names.filter((_, j) => (std[j] ?? 0) > 1e-8);
}

function fitOn(rows: ModelRow[], names: string[], y: number[], lambda: number): ColumnFit | null {
  if (rows.length === 0) return null;
  const X = design(rows, names);
  const { mean, std } = columnStats(X);
  const fit = fitRidgeOnStandardized(applyStandardize(X, mean, std), y, lambda);
  if (!fit) return null;
  return { mean, std, weights: fit.weights, intercept: fit.intercept };
}

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return n.toFixed(3);
}

export function judgeTarget(input: {
  trainN: number;
  testN: number;
  modelSpearman: number | null;
  baselineSpearman: number | null;
  modelMae: number | null;
  baselineMae: number | null;
}): { passed: boolean; reason: string } {
  if (input.trainN < MIN_TRAIN || input.testN < MIN_TEST) {
    return {
      passed: false,
      reason: `Need at least ${MIN_TRAIN} older posts and ${MIN_TEST} newer held-out posts (have ${input.trainN} and ${input.testN}).`,
    };
  }
  if (input.modelMae == null || input.baselineMae == null || !(input.baselineMae > 0)) {
    return { passed: false, reason: 'Could not compute error against the rolling-median baseline.' };
  }
  if (input.modelSpearman == null || !(input.modelSpearman > 0)) {
    return {
      passed: false,
      reason: `Held-out Spearman is ${fmt(input.modelSpearman)}, not a positive rank correlation.`,
    };
  }
  if (input.baselineSpearman != null && !(input.modelSpearman > input.baselineSpearman)) {
    return {
      passed: false,
      reason: `Held-out Spearman ${fmt(input.modelSpearman)} does not beat the rolling median (${fmt(input.baselineSpearman)}).`,
    };
  }
  const improvement = (input.baselineMae - input.modelMae) / input.baselineMae;
  if (!(improvement >= MIN_MAE_IMPROVEMENT)) {
    return {
      passed: false,
      reason: `Held-out MAE improved ${(improvement * 100).toFixed(1)}% versus the rolling median, short of 5%.`,
    };
  }
  return {
    passed: true,
    reason: `Held-out Spearman ${fmt(input.modelSpearman)} vs baseline ${fmt(input.baselineSpearman)}; MAE ${(improvement * 100).toFixed(1)}% lower than the rolling median.`,
  };
}

function asValidation(report: TargetReport): TargetValidation {
  return {
    passed: report.passed,
    reason: report.reason,
    testN: report.testN,
    trainN: report.trainN,
    spearman: report.spearman,
    mae: report.mae,
    medianAe: report.medianAe,
    baselineSpearman: report.baselineSpearman,
    baselineMae: report.baselineMae,
    baselineMedianAe: report.baselineMedianAe,
    heuristicSpearman: report.heuristicSpearman,
    heuristicMae: report.heuristicMae,
    checklistSpearman: report.checklistSpearman,
    coverage80: report.coverage80,
    maeLog: report.maeLog,
    baselineMaeLog: report.baselineMaeLog,
  };
}

function blank(reason: string, trainN: number, testN: number): TargetReport {
  return {
    passed: false,
    reason,
    testN,
    trainN,
    spearman: null,
    mae: null,
    medianAe: null,
    baselineSpearman: null,
    baselineMae: null,
    baselineMedianAe: null,
    heuristicSpearman: null,
    heuristicMae: null,
    checklistSpearman: null,
    coverage80: null,
    maeLog: null,
    baselineMaeLog: null,
    topWeights: [],
    holdout: [],
  };
}

interface EvalSpec {
  target: FittedTargetModel['target'];
  yOf: (row: ModelRow) => number;
  actualOf: (row: ModelRow) => number;
  baselineOf: (row: ModelRow) => number;
  reconstruct: (row: ModelRow, prediction: number) => number;
  heuristicOf: ((row: ModelRow) => number) | null;
  logMae: boolean;
}

interface EvalResult {
  report: TargetReport;
  shipped: FittedTargetModel | null;
}

function selectLambda(
  train: ModelRow[],
  names: string[],
  spec: EvalSpec,
): { lambda: number; q10: number; q90: number } {
  const fallback = { lambda: 10, q10: 0, q90: 0 };
  const cut = Math.floor(train.length * 0.75);
  const inner = train.slice(0, cut);
  const val = train.slice(cut);
  if (inner.length < 8 || val.length < 8) return fallback;
  const yInner = inner.map(spec.yOf);
  const yVal = val.map(spec.yOf);
  const stats = columnStats(design(inner, names));
  const Xz = applyStandardize(design(inner, names), stats.mean, stats.std);
  const Xval = applyStandardize(design(val, names), stats.mean, stats.std);
  let bestLambda = LAMBDA_GRID[LAMBDA_GRID.length - 1]!;
  let bestMae = Number.POSITIVE_INFINITY;
  let bestHat: number[] | null = null;
  for (const lambda of LAMBDA_GRID) {
    const fit = fitRidgeOnStandardized(Xz, yInner, lambda);
    if (!fit) continue;
    const hat = dotPredict(Xval, fit.weights, fit.intercept);
    const pred = val.map((row, i) => spec.reconstruct(row, hat[i]!));
    const err = mae(pred, val.map(spec.actualOf));
    if (err == null) continue;
    const better = err < bestMae - 1e-9;
    const tie = Math.abs(err - bestMae) <= 1e-9 && lambda > bestLambda;
    if (better || tie) {
      bestMae = err;
      bestLambda = lambda;
      bestHat = hat;
    }
  }
  if (!bestHat) return fallback;
  const residuals = yVal.map((value, i) => value - bestHat![i]!);
  let q10 = quantile(residuals, 0.1);
  let q90 = quantile(residuals, 0.9);
  if (q10 > q90) {
    const swap = q10;
    q10 = q90;
    q90 = swap;
  }
  return { lambda: bestLambda, q10, q90 };
}

function evaluateTarget(train: ModelRow[], test: ModelRow[], names: string[], spec: EvalSpec): EvalResult {
  if (train.length < 8 || test.length < 3) {
    return { report: blank('Not enough posts to fit a time-ordered model.', train.length, test.length), shipped: null };
  }
  const { lambda, q10, q90 } = selectLambda(train, names, spec);
  const trainFit = fitOn(train, names, train.map(spec.yOf), lambda);
  if (!trainFit) {
    return { report: blank('The model did not fit.', train.length, test.length), shipped: null };
  }
  const hat = dotPredict(
    applyStandardize(design(test, names), trainFit.mean, trainFit.std),
    trainFit.weights,
    trainFit.intercept,
  );
  const predicted = test.map((row, i) => spec.reconstruct(row, hat[i]!));
  const actual = test.map(spec.actualOf);
  const baseline = test.map(spec.baselineOf);
  const low = test.map((row, i) => spec.reconstruct(row, hat[i]! + q10));
  const high = test.map((row, i) => spec.reconstruct(row, hat[i]! + q90));
  let covered = 0;
  for (let i = 0; i < test.length; i++) {
    const lo = Math.min(low[i]!, high[i]!);
    const hi = Math.max(low[i]!, high[i]!);
    if (actual[i]! >= lo && actual[i]! <= hi) covered++;
  }
  const heuristic = spec.heuristicOf ? test.map(spec.heuristicOf) : null;
  const scores = test.map((row) => row.checklistScore);
  const modelMae = mae(predicted, actual);
  const baselineMae = mae(baseline, actual);
  const verdict = judgeTarget({
    trainN: train.length,
    testN: test.length,
    modelSpearman: spearman(predicted, actual),
    baselineSpearman: spearman(baseline, actual),
    modelMae,
    baselineMae,
  });
  const topWeights = names
    .map((name, j) => ({ name, weight: trainFit.weights[j] ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 8);

  let shipped: FittedTargetModel | null = null;
  if (verdict.passed) {
    const all = train.concat(test);
    const refit = fitOn(all, names, all.map(spec.yOf), lambda);
    if (refit) {
      shipped = {
        target: spec.target,
        featureNames: names,
        mean: refit.mean,
        std: refit.std,
        weights: refit.weights,
        intercept: refit.intercept,
        residualQ10: q10,
        residualQ90: q90,
        lambda,
      };
    }
  }

  return {
    shipped,
    report: {
      ...verdict,
      testN: test.length,
      trainN: train.length,
      spearman: spearman(predicted, actual),
      mae: modelMae,
      medianAe: medianAe(predicted, actual),
      baselineSpearman: spearman(baseline, actual),
      baselineMae,
      baselineMedianAe: medianAe(baseline, actual),
      heuristicSpearman: heuristic ? spearman(heuristic, actual) : null,
      heuristicMae: heuristic ? mae(heuristic, actual) : null,
      checklistSpearman: spearman(scores, actual),
      coverage80: test.length > 0 ? covered / test.length : null,
      maeLog: spec.logMae ? maeLog(predicted, actual) : null,
      baselineMaeLog: spec.logMae ? maeLog(baseline, actual) : null,
      topWeights,
      holdout: test.map((row, i) => ({
        id: row.id,
        actual: actual[i]!,
        predicted: predicted[i]!,
        baseline: baseline[i]!,
        heuristic: heuristic ? heuristic[i]! : null,
      })),
    },
  };
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

const IMPRESSIONS: EvalSpec = {
  target: 'log_impression_ratio',
  yOf: (row) => Math.log(row.impressions) - Math.log(row.baselineImpressions),
  actualOf: (row) => row.impressions,
  baselineOf: (row) => row.baselineImpressions,
  reconstruct: (row, prediction) => row.baselineImpressions * Math.exp(prediction),
  heuristicOf: (row) => row.heuristicImpressions,
  logMae: true,
};

const ENGAGEMENT: EvalSpec = {
  target: 'engagement_residual',
  yOf: (row) => row.engagement - row.baselineEngagement,
  actualOf: (row) => row.engagement,
  baselineOf: (row) => row.baselineEngagement,
  reconstruct: (row, prediction) => row.baselineEngagement + prediction,
  heuristicOf: null,
  logMae: false,
};

export function runBacktest(posts: HistoryPost[], options: BacktestOptions = {}): BacktestReport {
  const timezone = options.timezone ?? 'UTC';
  assertTimeZone(timezone);
  const asOf = options.asOf ?? new Date();
  const minAgeDays = options.minAgeDays ?? DEFAULT_MIN_AGE_DAYS;
  const window = options.window ?? DEFAULT_WINDOW;
  const minHistory = options.minHistory ?? DEFAULT_MIN_HISTORY;
  const trainFraction = options.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const prepared = prepareDataset(posts, { timezone, asOf, minAgeDays, window, minHistory });
  const rows = prepared.rows;
  const testStart = Math.floor(rows.length * trainFraction);
  const train = rows.slice(0, testStart);
  const test = rows.slice(testStart);
  const names = activeNames(train, orderedFeatureNames());

  const impressions = evaluateTarget(train, test, names, IMPRESSIONS);
  const engagement = evaluateTarget(train, test, names, ENGAGEMENT);

  const checklist = prepared.checklist;
  const status = impressions.shipped ? 'calibrated' : 'uncalibrated';
  let reason = impressions.report.reason;
  if (impressions.shipped && !engagement.shipped) {
    reason = `${reason} Engagement rate stays uncalibrated: ${engagement.report.reason}`;
  }

  const snapshot: ReachModelSnapshot = {
    version: 1,
    status,
    reason,
    trainedAt: (options.trainedAt ?? new Date()).toISOString(),
    timezone,
    eligiblePosts: prepared.eligible.length,
    modeledPosts: rows.length,
    trainPosts: train.length,
    testPosts: test.length,
    baselineImpressions: prepared.nextContext.baselineImpressions,
    baselineEngagement: prepared.nextContext.baselineEngagement,
    latestPostAt: prepared.nextContext.latestPostAt,
    recentPostAts: prepared.nextContext.recentPostAts,
    recentTopics: prepared.nextContext.recentTopics,
    impressions: impressions.shipped,
    engagement: engagement.shipped,
    validation: {
      impressions: asValidation(impressions.report),
      engagement: asValidation(engagement.report),
    },
  };

  const first = prepared.eligible[0];
  const last = prepared.eligible[prepared.eligible.length - 1];
  return {
    protocol: {
      targetImpressions: 'log(impressions / past rolling median impressions)',
      targetEngagement: '(likes + reposts + replies + quotes) / impressions, minus its past rolling median',
      split: `oldest ${Math.round(trainFraction * 100)}% train, newest ${Math.round((1 - trainFraction) * 100)}% test`,
      window,
      minHistory,
      minAgeDays,
      timezone,
      asOf: asOf.toISOString(),
      gate: `train>=${MIN_TRAIN}, test>=${MIN_TEST}, Spearman>0 and above the baseline, MAE at least ${MIN_MAE_IMPROVEMENT * 100}% lower`,
      duplicates: 'same caption after removing media and quote-permalink URLs; earliest post kept',
      heuristic: 'rolling median * (score/50) * media(image 1.35, video 1.15) * time(peak 1.25 else 1.12) * click-gap 1.18',
      intervals: '80% residual quantiles from the last 25% of the training span; live coefficients refit on all modeled posts only if the gate passes',
      features: names.length,
    },
    dropped: prepared.dropped,
    eligiblePosts: prepared.eligible.length,
    modeledPosts: rows.length,
    span: first && last ? [first.createdAt, last.createdAt] : null,
    checklistAllEligible: {
      n: checklist.length,
      impressionsSpearman: spearman(
        checklist.map((row) => row.score),
        checklist.map((row) => row.impressions),
      ),
      engagementSpearman: spearman(
        checklist.map((row) => row.score),
        checklist.map((row) => row.engagement),
      ),
      automatedSpamPosts: checklist.filter((row) => row.automatedSpam).length,
    },
    impressions: impressions.report,
    engagement: engagement.report,
    snapshot,
  };
}
