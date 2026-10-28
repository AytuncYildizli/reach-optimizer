import { prepareDataset, type HistoryPost, type ModelRow } from './dataset';
import { orderedFeatureNames } from './features';
import {
  HOOK_FEATURE_KEYS,
  LENGTH_FEATURE_KEYS,
  MEDIA_FEATURE_KEYS,
  TOPIC_FEATURE_KEYS,
} from './reach-features';
import {
  applyStandardize,
  columnStats,
  fitHuberRidge,
  fitLogisticRidge,
  fitQuantileRidge,
  fitRidge,
  fitWeightedRidgeOnStandardized,
  predictLogistic,
  predictRidge,
  type RidgeModel,
} from './ridge';
import { mae, spearman } from './stats';
import { LAMBDA_GRID, varyingFeatureNames, type BacktestOptions } from './model';

/**
 * One-change ablations around the shipped self-reply extended shrink model.
 * Every row is scored on the newest 25% of the training span. The newest 30%
 * is scored only for the winner. Quote-author size is not a candidate: this
 * import has no quoted-follower counts.
 */

const SHRINK_GRID = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const HALF_LIFE_DAYS = [60, 120, 365, Number.POSITIVE_INFINITY];
const TAU_GRID = [0.5, 0.6, 0.75];

export type AblationId =
  | 'current'
  | 'topics'
  | 'hooks'
  | 'length_thread'
  | 'media_gif'
  | 'huber'
  | 'quantile'
  | 'two_part'
  | 'recency'
  | 'all_features'
  | 'all_features_recency'
  | 'all_features_huber'
  | 'all_features_two_part';

type Group = 'topic' | 'hook' | 'length' | 'media';
type Loss = 'squared' | 'huber' | 'quantile' | 'two_part';

interface Candidate {
  id: AblationId;
  groups: Group[];
  loss: Loss;
  recency: boolean;
}

export const ABLATION_CANDIDATES: Candidate[] = [
  { id: 'current', groups: [], loss: 'squared', recency: false },
  { id: 'topics', groups: ['topic'], loss: 'squared', recency: false },
  { id: 'hooks', groups: ['hook'], loss: 'squared', recency: false },
  { id: 'length_thread', groups: ['length'], loss: 'squared', recency: false },
  { id: 'media_gif', groups: ['media'], loss: 'squared', recency: false },
  { id: 'huber', groups: [], loss: 'huber', recency: false },
  { id: 'quantile', groups: [], loss: 'quantile', recency: false },
  { id: 'two_part', groups: [], loss: 'two_part', recency: false },
  { id: 'recency', groups: [], loss: 'squared', recency: true },
  { id: 'all_features', groups: ['topic', 'hook', 'length', 'media'], loss: 'squared', recency: false },
  { id: 'all_features_recency', groups: ['topic', 'hook', 'length', 'media'], loss: 'squared', recency: true },
  { id: 'all_features_huber', groups: ['topic', 'hook', 'length', 'media'], loss: 'huber', recency: false },
  { id: 'all_features_two_part', groups: ['topic', 'hook', 'length', 'media'], loss: 'two_part', recency: false },
];

const GROUP_KEYS: Record<Group, readonly string[]> = {
  topic: TOPIC_FEATURE_KEYS,
  hook: HOOK_FEATURE_KEYS,
  length: LENGTH_FEATURE_KEYS,
  media: MEDIA_FEATURE_KEYS,
};

export interface AblationRow {
  id: AblationId;
  selectN: number;
  trainN: number;
  spearman: number | null;
  mae: number | null;
  baselineMae: number | null;
  maeGain: number | null;
  /** Candidate MAE minus the current config's select-slice MAE. Negative means lower error. */
  deltaMae: number | null;
  deltaSpearman: number | null;
  detail: string;
}

export interface AblationHoldout {
  id: AblationId;
  trainN: number;
  testN: number;
  spearman: number | null;
  mae: number | null;
  baselineSpearman: number | null;
  baselineMae: number | null;
  /** Versus the previously shipped holdout (MAE 5113.4, Spearman 0.664). */
  deltaMaeVsShipped: number | null;
  deltaSpearmanVsShipped: number | null;
  improvesOnShipped: boolean;
  detail: string;
}

export interface AblationReport {
  table: AblationRow[];
  chosen: AblationId;
  holdout: AblationHoldout;
  /** Quoted-author follower counts present on any prepared row. */
  quoteFollowersAvailable: boolean;
}

interface Tuned {
  predict(rows: ModelRow[]): number[];
  detail: string;
}

function matrix(rows: ModelRow[], names: string[]): number[][] {
  return rows.map((row) => names.map((name) => row.features[name] ?? 0));
}

function target(row: ModelRow): number {
  return Math.log(row.impressions) - Math.log(Math.max(row.baselineImpressions, 1e-6));
}

function impressions(baseline: number, yhat: number, k: number): number {
  return baseline * Math.exp(Math.max(-5, Math.min(5, k * yhat)));
}

function gain(model: number | null, baseline: number | null): number | null {
  if (model == null || baseline == null || !(baseline > 0)) return null;
  return (baseline - model) / baseline;
}

function recencyWeights(rows: ModelRow[], halfLifeDays: number): number[] {
  if (!Number.isFinite(halfLifeDays)) return rows.map(() => 1);
  const end = Date.parse(rows[rows.length - 1]?.createdAt ?? '') || 0;
  return rows.map((row) => Math.exp(-(end - Date.parse(row.createdAt)) / (halfLifeDays * 86400000)));
}

function fitSquared(rows: ModelRow[], names: string[], lambda: number, halfLife: number): RidgeModel | null {
  const X = matrix(rows, names);
  const y = rows.map(target);
  if (!Number.isFinite(halfLife)) return fitRidge(X, y, lambda);
  const { mean, std } = columnStats(X);
  const fit = fitWeightedRidgeOnStandardized(applyStandardize(X, mean, std), y, recencyWeights(rows, halfLife), lambda);
  if (!fit) return null;
  return { ...fit, mean, std };
}

function fitLoss(rows: ModelRow[], names: string[], lambda: number, loss: Loss, tau: number, halfLife: number): RidgeModel | null {
  const X = matrix(rows, names);
  const y = rows.map(target);
  if (loss === 'huber') return fitHuberRidge(X, y, lambda, 1);
  if (loss === 'quantile') return fitQuantileRidge(X, y, lambda, tau);
  return fitSquared(rows, names, lambda, halfLife);
}

function predictModel(model: RidgeModel, rows: ModelRow[], names: string[], k: number): number[] {
  const yhat = predictRidge(model, matrix(rows, names));
  return rows.map((row, i) => impressions(row.baselineImpressions, yhat[i]!, k));
}

function fitTwoPart(rows: ModelRow[], names: string[], lambda: number): Tuned | null {
  const labels = rows.map((row) => (row.impressions > 3 * row.baselineImpressions ? 1 : 0));
  const positives = labels.filter((label) => label === 1).length;
  if (positives < 12 || labels.length - positives < 12) return null;
  const all = fitRidge(matrix(rows, names), rows.map(target), lambda);
  if (!all) return null;
  const loRows = rows.filter((_, i) => labels[i] === 0);
  const hiRows = rows.filter((_, i) => labels[i] === 1);
  const lo = fitRidge(matrix(loRows, names), loRows.map(target), lambda) ?? all;
  const hi = fitRidge(matrix(hiRows, names), hiRows.map(target), lambda) ?? all;
  const head = fitLogisticRidge(matrix(rows, names), labels, lambda);
  if (!head) return null;
  return {
    detail: `lambda ${lambda} two-part positives ${positives}`,
    predict(next: ModelRow[]): number[] {
      const prob = predictLogistic(head, matrix(next, names));
      const low = predictRidge(lo, matrix(next, names));
      const high = predictRidge(hi, matrix(next, names));
      return next.map((row, i) => {
        const mix = (1 - prob[i]!) * Math.exp(Math.max(-5, Math.min(5, low[i]!))) + prob[i]! * Math.exp(Math.max(-5, Math.min(5, high[i]!)));
        return row.baselineImpressions * mix;
      });
    },
  };
}

function tune(core: ModelRow[], hyper: ModelRow[], names: string[], candidate: Candidate): { lambda: number; k: number; tau: number; halfLife: number } {
  let best = { lambda: 300, k: 1, tau: 0.5, halfLife: Number.POSITIVE_INFINITY, mae: Number.POSITIVE_INFINITY };
  const lambdas = LAMBDA_GRID;
  const ks = candidate.loss === 'two_part' ? [1] : SHRINK_GRID;
  const taus = candidate.loss === 'quantile' ? TAU_GRID : [0.5];
  const lives = candidate.recency ? HALF_LIFE_DAYS : [Number.POSITIVE_INFINITY];
  if (hyper.length < 8 || core.length < 20) return { lambda: best.lambda, k: best.k, tau: best.tau, halfLife: best.halfLife };
  for (const lambda of lambdas) {
    for (const tau of taus) {
      for (const halfLife of lives) {
        if (candidate.loss === 'two_part') {
          const tuned = fitTwoPart(core, names, lambda);
          if (!tuned) continue;
          const pred = tuned.predict(hyper);
          const err = mae(pred, hyper.map((row) => row.impressions));
          if (err != null && err < best.mae - 1e-9) best = { lambda, k: 1, tau, halfLife, mae: err };
          continue;
        }
        const model = fitLoss(core, names, lambda, candidate.loss, tau, halfLife);
        if (!model) continue;
        const yhat = predictRidge(model, matrix(hyper, names));
        for (const k of ks) {
          const pred = hyper.map((row, i) => impressions(row.baselineImpressions, yhat[i]!, k));
          const err = mae(pred, hyper.map((row) => row.impressions));
          if (err == null) continue;
          const better = err < best.mae - 1e-9;
          const tie = Math.abs(err - best.mae) <= 1e-9 && lambda > best.lambda;
          if (better || tie) best = { lambda, k, tau, halfLife, mae: err };
        }
      }
    }
  }
  return { lambda: best.lambda, k: best.k, tau: best.tau, halfLife: best.halfLife };
}

function fitTuned(rows: ModelRow[], names: string[], candidate: Candidate, choice: { lambda: number; k: number; tau: number; halfLife: number }): Tuned | null {
  if (candidate.loss === 'two_part') return fitTwoPart(rows, names, choice.lambda);
  const model = fitLoss(rows, names, choice.lambda, candidate.loss, choice.tau, choice.halfLife);
  if (!model) return null;
  const detail = [
    `lambda ${choice.lambda}`,
    `k ${choice.k}`,
    candidate.loss === 'quantile' ? `tau ${choice.tau}` : '',
    candidate.recency ? `halfLife ${Number.isFinite(choice.halfLife) ? choice.halfLife : 'none'}` : '',
    candidate.loss,
  ].filter(Boolean).join(' ');
  return {
    detail,
    predict: (next) => predictModel(model, next, names, choice.k),
  };
}

function featureNames(candidate: Candidate): string[] {
  const extra = candidate.groups.flatMap((group) => [...GROUP_KEYS[group]]);
  return [...orderedFeatureNames({ extended: true }), ...extra];
}

function scoreSplit(pred: number[], rows: ModelRow[]): { spearman: number | null; mae: number | null; baselineMae: number | null; baselineSpearman: number | null } {
  const actual = rows.map((row) => row.impressions);
  const baseline = rows.map((row) => row.baselineImpressions);
  return {
    spearman: spearman(pred, actual),
    mae: mae(pred, actual),
    baselineMae: mae(baseline, actual),
    baselineSpearman: spearman(baseline, actual),
  };
}

export function runReachAblation(posts: HistoryPost[], options: BacktestOptions = {}): AblationReport {
  const timezone = options.timezone ?? 'UTC';
  const asOf = options.asOf ?? new Date();
  const trainFraction = options.trainFraction ?? 0.7;
  const prepared = prepareDataset(posts, {
    timezone,
    asOf,
    minAgeDays: options.minAgeDays ?? 3,
    window: options.window ?? 20,
    minHistory: options.minHistory ?? 8,
    includeSelfReplies: true,
    quotedImpressions: false,
  });
  const rows = prepared.rows;
  const cut = Math.floor(rows.length * trainFraction);
  const train = rows.slice(0, cut);
  const test = rows.slice(cut);
  const selectAt = Math.floor(train.length * 0.75);
  const fitRows = train.slice(0, selectAt);
  const select = train.slice(selectAt);
  const hyperAt = Math.floor(fitRows.length * 0.75);
  const core = fitRows.slice(0, hyperAt);
  const hyper = fitRows.slice(hyperAt);
  const quoteFollowersAvailable = rows.some((row) => row.features.q_log_followers > 0);

  const fitted: Array<{ candidate: Candidate; names: string[]; tuned: Tuned | null }> = [];
  const table: AblationRow[] = [];
  let currentMae: number | null = null;
  let currentSpearman: number | null = null;
  for (const candidate of ABLATION_CANDIDATES) {
    const names = varyingFeatureNames(core, featureNames(candidate));
    const choice = tune(core, hyper, names, candidate);
    const tuned = fitTuned(fitRows, names, candidate, choice);
    fitted.push({ candidate, names, tuned });
    const pred = tuned ? tuned.predict(select) : [];
    const scored = tuned ? scoreSplit(pred, select) : { spearman: null, mae: null, baselineMae: null, baselineSpearman: null };
    if (candidate.id === 'current') {
      currentMae = scored.mae;
      currentSpearman = scored.spearman;
    }
    table.push({
      id: candidate.id,
      selectN: select.length,
      trainN: fitRows.length,
      spearman: scored.spearman,
      mae: scored.mae,
      baselineMae: scored.baselineMae,
      maeGain: gain(scored.mae, scored.baselineMae),
      deltaMae: scored.mae != null && currentMae != null && candidate.id !== 'current' ? scored.mae - currentMae : candidate.id === 'current' ? 0 : null,
      deltaSpearman: scored.spearman != null && currentSpearman != null && candidate.id !== 'current' ? scored.spearman - currentSpearman : candidate.id === 'current' ? 0 : null,
      detail: tuned?.detail ?? 'did not fit',
    });
  }
  // Deltas for rows that ran before `current` were computed against a null reference.
  for (const row of table) {
    if (row.id === 'current') continue;
    row.deltaMae = row.mae != null && currentMae != null ? row.mae - currentMae : null;
    row.deltaSpearman = row.spearman != null && currentSpearman != null ? row.spearman - currentSpearman : null;
  }

  let best = table[0]!;
  for (const row of table) {
    const rowGain = row.maeGain ?? Number.NEGATIVE_INFINITY;
    const bestGain = best.maeGain ?? Number.NEGATIVE_INFINITY;
    const better = rowGain > bestGain + 1e-12;
    const tie = Math.abs(rowGain - bestGain) <= 1e-12 && (row.spearman ?? -Infinity) > (best.spearman ?? -Infinity);
    if (better || tie) best = row;
  }
  const winner = fitted.find((item) => item.candidate.id === best.id)!;
  const innerAt = Math.floor(train.length * 0.75);
  const names = varyingFeatureNames(train.slice(0, innerAt), featureNames(winner.candidate));
  const choice = tune(train.slice(0, innerAt), train.slice(innerAt), names, winner.candidate);
  const sealed = fitTuned(train, names, winner.candidate, choice);
  const pred = sealed ? sealed.predict(test) : [];
  const hold = sealed ? scoreSplit(pred, test) : { spearman: null, mae: null, baselineMae: null, baselineSpearman: null };
  const shippedMae = 5113.407941717431;
  const shippedSpearman = 0.6637161938511263;
  const improves = hold.mae != null && hold.spearman != null && hold.mae < shippedMae && hold.spearman > shippedSpearman;
  return {
    table,
    chosen: best.id,
    quoteFollowersAvailable,
    holdout: {
      id: best.id,
      trainN: train.length,
      testN: test.length,
      spearman: hold.spearman,
      mae: hold.mae,
      baselineSpearman: hold.baselineSpearman,
      baselineMae: hold.baselineMae,
      deltaMaeVsShipped: hold.mae != null ? hold.mae - shippedMae : null,
      deltaSpearmanVsShipped: hold.spearman != null ? hold.spearman - shippedSpearman : null,
      improvesOnShipped: improves,
      detail: sealed?.detail ?? 'did not fit',
    },
  };
}
