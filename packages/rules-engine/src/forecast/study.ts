import type { HistoryPost, ModelRow, PrepareOptions } from './dataset';
import { postsByAccount, prepareDataset } from './dataset';
import { fitBoost, predictBoost } from './boost';
import { orderedFeatureNames } from './features';
import {
  DEFAULT_MIN_AGE_DAYS,
  DEFAULT_MIN_HISTORY,
  DEFAULT_TRAIN_FRACTION,
  DEFAULT_WINDOW,
  LAMBDA_GRID,
  MIN_MAE_IMPROVEMENT,
  judgeTarget,
  varyingFeatureNames,
  type BacktestOptions,
} from './model';
import { accountDummyName } from './pooled';
import { fitHuberRidge, fitRidge, predictRidge, type RidgeModel } from './ridge';
import { mae, maeLog, medianAe, spearman } from './stats';

/**
 * Fixed menu. The winner is the largest raw-MAE improvement on the
 * train-internal select slice. The newest 30% of each account is not read
 * until that choice is locked.
 */
export const STUDY_CONFIGS = [
  'relative_ridge',
  'absolute_log',
  'relative_shrink',
  'huber',
  'gbt',
  'extended_shrink',
  'self_reply_extended_shrink',
  'ewma_type',
] as const;

export type StudyConfigName = (typeof STUDY_CONFIGS)[number];

const SHRINK_GRID = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const TREE_GRID = [20, 50, 100];
const TREE_RATE = 0.1;

export interface StudyRow {
  config: StudyConfigName;
  trainN: number;
  selectN: number;
  spearman: number | null;
  mae: number | null;
  baselineMae: number | null;
  /** (baselineMae − mae) / baselineMae on the select slice. */
  maeGain: number | null;
  ewmaMae: number | null;
  detail: string;
}

export interface HoldoutScore {
  config: StudyConfigName;
  trainN: number;
  testN: number;
  spearman: number | null;
  baselineSpearman: number | null;
  mae: number | null;
  baselineMae: number | null;
  maeGain: number | null;
  medianAe: number | null;
  baselineMedianAe: number | null;
  maeLog: number | null;
  baselineMaeLog: number | null;
  ewmaMae: number | null;
  ewmaSpearman: number | null;
  passed: boolean;
  reason: string;
  perAccount: Array<{
    account: string;
    testN: number;
    spearman: number | null;
    baselineSpearman: number | null;
    mae: number | null;
    baselineMae: number | null;
    maeGain: number | null;
  }>;
}

export interface StudyReport {
  protocol: Record<string, string | number>;
  table: StudyRow[];
  chosen: StudyConfigName;
  holdout: HoldoutScore;
}

interface Spec {
  name: StudyConfigName;
  rows: 'base' | 'extended' | 'self';
  target: 'relative' | 'absolute' | 'ewma';
  loss: 'squared' | 'huber' | 'gbt' | 'none';
  shrink: boolean;
}

const SPECS: Spec[] = [
  { name: 'relative_ridge', rows: 'base', target: 'relative', loss: 'squared', shrink: false },
  { name: 'absolute_log', rows: 'base', target: 'absolute', loss: 'squared', shrink: false },
  { name: 'relative_shrink', rows: 'base', target: 'relative', loss: 'squared', shrink: true },
  { name: 'huber', rows: 'base', target: 'relative', loss: 'huber', shrink: false },
  { name: 'gbt', rows: 'base', target: 'relative', loss: 'gbt', shrink: false },
  { name: 'extended_shrink', rows: 'extended', target: 'relative', loss: 'squared', shrink: true },
  { name: 'self_reply_extended_shrink', rows: 'self', target: 'relative', loss: 'squared', shrink: true },
  { name: 'ewma_type', rows: 'base', target: 'ewma', loss: 'none', shrink: false },
];

interface Bundle {
  account: string;
  core: ModelRow[];
  hyper: ModelRow[];
  select: ModelRow[];
  train: ModelRow[];
  test: ModelRow[];
}

function gain(model: number | null, baseline: number | null): number | null {
  if (model == null || baseline == null || !(baseline > 0)) return null;
  return (baseline - model) / baseline;
}

export function pickStudyWinner(table: StudyRow[]): StudyConfigName {
  let best = table[0]?.config ?? 'relative_ridge';
  let bestGain = Number.NEGATIVE_INFINITY;
  let bestSpearman = Number.NEGATIVE_INFINITY;
  for (const row of table) {
    const rowGain = row.maeGain ?? Number.NEGATIVE_INFINITY;
    const rowSpearman = row.spearman ?? Number.NEGATIVE_INFINITY;
    const betterGain = rowGain > bestGain + 1e-12;
    const tie = Math.abs(rowGain - bestGain) <= 1e-12 && rowSpearman > bestSpearman + 1e-12;
    if (betterGain || tie) {
      best = row.config;
      bestGain = rowGain;
      bestSpearman = rowSpearman;
    }
  }
  return best;
}

function byTime(a: ModelRow, b: ModelRow): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.account.localeCompare(b.account) || a.id.localeCompare(b.id);
}

function matrix(rows: ModelRow[], names: string[]): number[][] {
  return rows.map((row) => names.map((name) => row.features[name] ?? 0));
}

function targetOf(row: ModelRow, target: Spec['target']): number {
  if (target === 'absolute') return Math.log(Math.max(row.impressions, 1e-6));
  return Math.log(row.impressions) - Math.log(Math.max(row.baselineImpressions, 1e-6));
}

function impressionsOf(row: ModelRow, yhat: number, target: Spec['target'], k: number): number {
  if (target === 'ewma') return row.ewmaImpressions ?? row.baselineImpressions;
  if (target === 'absolute') return Math.exp(Math.max(-5, Math.min(12, yhat)));
  return row.baselineImpressions * Math.exp(Math.max(-5, Math.min(5, k * yhat)));
}

function ewmaPred(row: ModelRow): number {
  return row.ewmaImpressions ?? row.baselineImpressions;
}

interface Tuned {
  predict(rows: ModelRow[]): number[];
  detail: string;
}

function tuneLinear(
  core: ModelRow[],
  hyper: ModelRow[],
  refit: ModelRow[],
  names: string[],
  spec: Spec,
): Tuned {
  const yCore = core.map((row) => targetOf(row, spec.target));
  const Xcore = matrix(core, names);
  const Xhyper = matrix(hyper, names);
  const ks = spec.shrink ? SHRINK_GRID : [1];
  let bestLambda = LAMBDA_GRID[LAMBDA_GRID.length - 1]!;
  let bestK = 1;
  let bestMae = Number.POSITIVE_INFINITY;
  if (hyper.length >= 5 && core.length >= 8) {
    for (const lambda of LAMBDA_GRID) {
      const model =
        spec.loss === 'huber' ? fitHuberRidge(Xcore, yCore, lambda, 1) : fitRidge(Xcore, yCore, lambda);
      if (!model) continue;
      const yhat = predictRidge(model, Xhyper);
      for (const k of ks) {
        const pred = hyper.map((row, i) => impressionsOf(row, yhat[i]!, spec.target, k));
        const err = mae(pred, hyper.map((row) => row.impressions));
        if (err == null) continue;
        const better = err < bestMae - 1e-9;
        const tie = Math.abs(err - bestMae) <= 1e-9 && (lambda > bestLambda || (lambda === bestLambda && k < bestK));
        if (better || tie) {
          bestMae = err;
          bestLambda = lambda;
          bestK = k;
        }
      }
    }
  }
  const fitted =
    spec.loss === 'huber'
      ? fitHuberRidge(matrix(refit, names), refit.map((row) => targetOf(row, spec.target)), bestLambda, 1)
      : fitRidge(matrix(refit, names), refit.map((row) => targetOf(row, spec.target)), bestLambda);
  const model: RidgeModel | null = fitted;
  return {
    detail: `lambda ${bestLambda}${spec.shrink ? ` k ${bestK}` : ''}`,
    predict(rows: ModelRow[]): number[] {
      if (!model) return rows.map((row) => (spec.target === 'absolute' ? row.baselineImpressions : row.baselineImpressions));
      const yhat = predictRidge(model, matrix(rows, names));
      return rows.map((row, i) => impressionsOf(row, yhat[i]!, spec.target, bestK));
    },
  };
}

function tuneBoost(core: ModelRow[], hyper: ModelRow[], refit: ModelRow[], names: string[]): Tuned {
  const y = (rows: ModelRow[]) => rows.map((row) => targetOf(row, 'relative'));
  let bestTrees = TREE_GRID[0]!;
  let bestMae = Number.POSITIVE_INFINITY;
  if (hyper.length >= 5 && core.length >= 8 && names.length > 0) {
    for (const trees of TREE_GRID) {
      const model = fitBoost(matrix(core, names), y(core), trees, TREE_RATE, 2, 8);
      const yhat = predictBoost(model, matrix(hyper, names));
      const pred = hyper.map((row, i) => impressionsOf(row, yhat[i]!, 'relative', 1));
      const err = mae(pred, hyper.map((row) => row.impressions));
      if (err == null) continue;
      if (err < bestMae - 1e-9) {
        bestMae = err;
        bestTrees = trees;
      }
    }
  }
  const model = fitBoost(matrix(refit, names), y(refit), bestTrees, TREE_RATE, 2, 8);
  return {
    detail: `trees ${bestTrees} depth 2 lr ${TREE_RATE}`,
    predict(rows: ModelRow[]): number[] {
      const yhat = predictBoost(model, matrix(rows, names));
      return rows.map((row, i) => impressionsOf(row, yhat[i]!, 'relative', 1));
    },
  };
}

function fitSpec(core: ModelRow[], hyper: ModelRow[], refit: ModelRow[], names: string[], spec: Spec): Tuned {
  if (spec.target === 'ewma') {
    return {
      detail: 'span-20 EWMA within original/quote/reply, else the rolling median',
      predict: (rows) => rows.map(ewmaPred),
    };
  }
  if (spec.loss === 'gbt') return tuneBoost(core, hyper, refit, names);
  return tuneLinear(core, hyper, refit, names, spec);
}

function withDummies(rows: ModelRow[], dummies: Map<string, string>, keepFollowers: boolean): ModelRow[] {
  return rows.map((row) => {
    const features = { ...row.features };
    if (!keepFollowers) features.log1p_followers = 0;
    for (const name of dummies.values()) features[name] = 0;
    const own = dummies.get(row.account);
    if (own) features[own] = 1;
    return { ...row, features };
  });
}

function followersVary(rows: ModelRow[]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0]!.features.log1p_followers ?? 0;
  return rows.some((row) => Math.abs((row.features.log1p_followers ?? 0) - first) > 1e-8);
}

function bundleRows(posts: HistoryPost[], prepare: PrepareOptions, trainFraction: number): Bundle[] {
  return postsByAccount(posts).map((group) => {
    const prepared = prepareDataset(
      group.posts.map((post) => ({ ...post, account: group.account })),
      prepare,
    );
    const rows = prepared.rows.map((row) => ({ ...row, account: group.account }));
    const cut = Math.floor(rows.length * trainFraction);
    const train = rows.slice(0, cut);
    const test = rows.slice(cut);
    const selectAt = Math.floor(train.length * 0.75);
    const fit = train.slice(0, selectAt);
    const select = train.slice(selectAt);
    const hyperAt = Math.floor(fit.length * 0.75);
    return {
      account: group.account,
      core: fit.slice(0, hyperAt),
      hyper: fit.slice(hyperAt),
      select,
      train,
      test,
    };
  });
}

function decorateAll(bundles: Bundle[], extended: boolean): { bundles: Bundle[]; namesFor: (rows: ModelRow[]) => string[] } {
  const accounts = bundles.map((bundle) => bundle.account).sort((a, b) => a.localeCompare(b));
  const reference = accounts[0] ?? null;
  const dummies = new Map<string, string>();
  const used = new Set<string>();
  for (const account of accounts) {
    if (account === reference) continue;
    let name = accountDummyName(account);
    let n = 2;
    while (used.has(name)) {
      name = `${accountDummyName(account)}_${n}`;
      n++;
    }
    used.add(name);
    dummies.set(account, name);
  }
  const keepFollowers = bundles.some((bundle) => followersVary(bundle.train));
  const apply = (rows: ModelRow[]) => withDummies(rows, dummies, keepFollowers);
  const decorated = bundles.map((bundle) => ({
    account: bundle.account,
    core: apply(bundle.core),
    hyper: apply(bundle.hyper),
    select: apply(bundle.select),
    train: apply(bundle.train),
    test: apply(bundle.test),
  }));
  const baseNames = [...orderedFeatureNames({ extended }), ...dummies.values()];
  return {
    bundles: decorated,
    namesFor: (rows) => varyingFeatureNames(rows, baseNames),
  };
}

function scoreRows(pred: number[], rows: ModelRow[]): { spearman: number | null; mae: number | null; baselineMae: number | null; ewmaMae: number | null } {
  const actual = rows.map((row) => row.impressions);
  const baseline = rows.map((row) => row.baselineImpressions);
  return {
    spearman: spearman(pred, actual),
    mae: mae(pred, actual),
    baselineMae: mae(baseline, actual),
    ewmaMae: mae(rows.map(ewmaPred), actual),
  };
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

export function runStudy(posts: HistoryPost[], options: BacktestOptions = {}): StudyReport {
  const timezone = options.timezone ?? 'UTC';
  assertTimeZone(timezone);
  const asOf = options.asOf ?? new Date();
  const trainFraction = options.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const prepareBase: PrepareOptions = {
    timezone,
    asOf,
    minAgeDays: options.minAgeDays ?? DEFAULT_MIN_AGE_DAYS,
    window: options.window ?? DEFAULT_WINDOW,
    minHistory: options.minHistory ?? DEFAULT_MIN_HISTORY,
    quotedImpressions: false,
  };
  const baseBundles = bundleRows(posts, prepareBase, trainFraction);
  const sets = {
    base: decorateAll(baseBundles, false),
    extended: decorateAll(baseBundles, true),
    self: decorateAll(bundleRows(posts, { ...prepareBase, includeSelfReplies: true }, trainFraction), true),
  };

  const table: StudyRow[] = [];
  for (const spec of SPECS) {
    const set = sets[spec.rows];
    const core = set.bundles.flatMap((bundle) => bundle.core).sort(byTime);
    const hyper = set.bundles.flatMap((bundle) => bundle.hyper).sort(byTime);
    const fit = core.concat(hyper);
    const select = set.bundles.flatMap((bundle) => bundle.select).sort(byTime);
    const names = set.namesFor(core);
    const tuned = fitSpec(core, hyper, fit, names, spec);
    const pred = tuned.predict(select);
    const scored = scoreRows(pred, select);
    table.push({
      config: spec.name,
      trainN: fit.length,
      selectN: select.length,
      spearman: scored.spearman,
      mae: scored.mae,
      baselineMae: scored.baselineMae,
      maeGain: gain(scored.mae, scored.baselineMae),
      ewmaMae: scored.ewmaMae,
      detail: tuned.detail,
    });
  }

  const chosen = pickStudyWinner(table);
  const spec = SPECS.find((item) => item.name === chosen)!;
  const set = sets[spec.rows];
  const train = set.bundles.flatMap((bundle) => bundle.train).sort(byTime);
  const test = set.bundles.flatMap((bundle) => bundle.test).sort(byTime);
  const innerAt = Math.floor(train.length * 0.75);
  const names = set.namesFor(train.slice(0, innerAt));
  const tuned = fitSpec(train.slice(0, innerAt), train.slice(innerAt), train, names, spec);
  const pred = tuned.predict(test);
  const actual = test.map((row) => row.impressions);
  const baseline = test.map((row) => row.baselineImpressions);
  const modelMae = mae(pred, actual);
  const baselineMae = mae(baseline, actual);
  const verdict = judgeTarget({
    trainN: train.length,
    testN: test.length,
    modelSpearman: spearman(pred, actual),
    baselineSpearman: spearman(baseline, actual),
    modelMae,
    baselineMae,
  });
  const perAccount = set.bundles.map((bundle) => {
    const accountPred = tuned.predict(bundle.test);
    const accountActual = bundle.test.map((row) => row.impressions);
    const accountBase = bundle.test.map((row) => row.baselineImpressions);
    const accountMae = mae(accountPred, accountActual);
    const accountBaseline = mae(accountBase, accountActual);
    return {
      account: bundle.account,
      testN: bundle.test.length,
      spearman: spearman(accountPred, accountActual),
      baselineSpearman: spearman(accountBase, accountActual),
      mae: accountMae,
      baselineMae: accountBaseline,
      maeGain: gain(accountMae, accountBaseline),
    };
  });

  return {
    protocol: {
      selection: 'largest raw-MAE improvement vs the rolling median on the newest 25% of each account training span. Tie: higher Spearman, then the earlier config. The newest 30% is sealed until this choice.',
      hyperparameters: 'lambda, shrink k, and tree count are chosen on the newest 25% of the fit span only, then the model is refit on the whole fit span',
      gate: `unchanged: train>=40, test>=20, Spearman>0 and above the rolling median, raw MAE at least ${MIN_MAE_IMPROVEMENT * 100}% lower. EWMA is a competitor in the table and on the holdout, not a replacement gate`,
      quotedImpressions: 'off',
      shrink: SHRINK_GRID.join(','),
      huberDelta: 1,
      asOf: asOf.toISOString(),
      timezone,
      chosen,
      chosenDetail: tuned.detail,
    },
    table,
    chosen,
    holdout: {
      config: chosen,
      trainN: train.length,
      testN: test.length,
      spearman: spearman(pred, actual),
      baselineSpearman: spearman(baseline, actual),
      mae: modelMae,
      baselineMae,
      maeGain: gain(modelMae, baselineMae),
      medianAe: medianAe(pred, actual),
      baselineMedianAe: medianAe(baseline, actual),
      maeLog: maeLog(pred, actual),
      baselineMaeLog: maeLog(baseline, actual),
      ewmaMae: mae(test.map(ewmaPred), actual),
      ewmaSpearman: spearman(test.map(ewmaPred), actual),
      passed: verdict.passed,
      reason: verdict.reason,
      perAccount,
    },
  };
}
