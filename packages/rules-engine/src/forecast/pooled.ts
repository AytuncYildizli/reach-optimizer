import type { HistoryPost, ModelRow, PrepareOptions } from './dataset';
import { postsByAccount, prepareDataset } from './dataset';
import { orderedFeatureNames } from './features';
import {
  DEFAULT_MIN_AGE_DAYS,
  DEFAULT_MIN_HISTORY,
  DEFAULT_TRAIN_FRACTION,
  DEFAULT_WINDOW,
  MIN_MAE_IMPROVEMENT,
  MIN_TEST,
  MIN_TRAIN,
  scoreSplit,
  varyingFeatureNames,
  type BacktestOptions,
  type TargetReport,
} from './model';

export interface AccountPooledReport {
  account: string;
  eligiblePosts: number;
  modeledPosts: number;
  trainN: number;
  testN: number;
  span: [string, string] | null;
  dropped: Record<string, number>;
  /** Fit on this account's older posts only. */
  own: { impressions: TargetReport; engagement: TargetReport };
  /** The shared model, scored on this account's newer posts. */
  pooled: { impressions: TargetReport; engagement: TargetReport };
}

export interface PooledBacktestReport {
  protocol: Record<string, string | number>;
  accounts: AccountPooledReport[];
  pooled: { impressions: TargetReport; engagement: TargetReport };
  featuresUsed: string[];
  quotedImpressions: boolean;
  followersIncluded: boolean;
  /** Sorted-first account. Its level is the intercept; other accounts get dummies. */
  referenceAccount: string | null;
}

interface Slice {
  account: string;
  rows: ModelRow[];
  train: ModelRow[];
  test: ModelRow[];
  eligiblePosts: number;
  dropped: Record<string, number>;
  span: [string, string] | null;
}

function byTime(a: ModelRow, b: ModelRow): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.account.localeCompare(b.account) || a.id.localeCompare(b.id);
}

function followersVary(rows: ModelRow[]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0]!.features.log1p_followers ?? 0;
  return rows.some((row) => Math.abs((row.features.log1p_followers ?? 0) - first) > 1e-8);
}

function withFeatures(row: ModelRow, features: Record<string, number>): ModelRow {
  return { ...row, features };
}

export function accountDummyName(account: string): string {
  const slug = account.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `acct_${slug || 'account'}`;
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

/**
 * One ridge across accounts. Each account keeps its own rolling baseline and
 * its own 70/30 time split. Account levels are one-hot columns, with the
 * sorted-first account as the reference intercept. A constant follower count
 * inside every account is removed so it cannot impersonate that intercept.
 */
export function runPooledBacktest(posts: HistoryPost[], options: BacktestOptions = {}): PooledBacktestReport {
  const timezone = options.timezone ?? 'UTC';
  assertTimeZone(timezone);
  const asOf = options.asOf ?? new Date();
  const prepare: PrepareOptions = {
    timezone,
    asOf,
    minAgeDays: options.minAgeDays ?? DEFAULT_MIN_AGE_DAYS,
    window: options.window ?? DEFAULT_WINDOW,
    minHistory: options.minHistory ?? DEFAULT_MIN_HISTORY,
    quotedImpressions: options.quotedImpressions ?? false,
  };
  const trainFraction = options.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const groups = postsByAccount(posts);
  const slices: Slice[] = groups.map((group) => {
    const prepared = prepareDataset(group.posts, prepare);
    const cut = Math.floor(prepared.rows.length * trainFraction);
    const first = prepared.eligible[0];
    const last = prepared.eligible[prepared.eligible.length - 1];
    return {
      account: group.account,
      rows: prepared.rows.map((row) => ({ ...row, account: group.account })),
      train: prepared.rows.slice(0, cut).map((row) => ({ ...row, account: group.account })),
      test: prepared.rows.slice(cut).map((row) => ({ ...row, account: group.account })),
      eligiblePosts: prepared.eligible.length,
      dropped: prepared.dropped,
      span: first && last ? [first.createdAt, last.createdAt] : null,
    };
  });

  const followersIncluded = slices.some((slice) => followersVary(slice.train.concat(slice.test)));
  const accounts = slices.map((slice) => slice.account).sort((a, b) => a.localeCompare(b));
  const reference = accounts[0] ?? null;
  const used = new Set<string>();
  const dummyByAccount = new Map<string, string>();
  for (const account of accounts) {
    if (account === reference) continue;
    let name = accountDummyName(account);
    let n = 2;
    while (used.has(name)) {
      name = `${accountDummyName(account)}_${n}`;
      n++;
    }
    used.add(name);
    dummyByAccount.set(account, name);
  }

  const decorate = (row: ModelRow): ModelRow => {
    const features = { ...row.features };
    if (!followersIncluded) features.log1p_followers = 0;
    for (const name of dummyByAccount.values()) features[name] = 0;
    const dummy = dummyByAccount.get(row.account);
    if (dummy) features[dummy] = 1;
    return withFeatures(row, features);
  };

  const decorated = slices.map((slice) => ({
    ...slice,
    train: slice.train.map(decorate),
    test: slice.test.map(decorate),
  }));

  const baseNames = orderedFeatureNames({ quotedImpressions: prepare.quotedImpressions });
  const dummyNames = [...dummyByAccount.values()];
  const pooledTrain = decorated.flatMap((slice) => slice.train).sort(byTime);
  const pooledTest = decorated.flatMap((slice) => slice.test).sort(byTime);
  const pooledNames = varyingFeatureNames(pooledTrain, [...baseNames, ...dummyNames]);
  const pooledFit = scoreSplit(pooledTrain, pooledTest, pooledNames);

  const accountReports: AccountPooledReport[] = decorated.map((slice) => {
    const ownNames = varyingFeatureNames(slice.train, [...baseNames, ...dummyNames]);
    const own = scoreSplit(slice.train, slice.test, ownNames);
    const pooled = scoreSplit(pooledTrain, slice.test, pooledNames);
    return {
      account: slice.account,
      eligiblePosts: slice.eligiblePosts,
      modeledPosts: slice.train.length + slice.test.length,
      trainN: slice.train.length,
      testN: slice.test.length,
      span: slice.span,
      dropped: slice.dropped,
      own: { impressions: own.impressions.report, engagement: own.engagement.report },
      pooled: { impressions: pooled.impressions.report, engagement: pooled.engagement.report },
    };
  });

  return {
    protocol: {
      targetImpressions: 'log(impressions / past rolling median impressions), baseline computed inside each account',
      targetEngagement: '(likes + reposts + replies + quotes) / impressions, minus its past rolling median, per account',
      split: `per account, oldest ${Math.round(trainFraction * 100)}% train and newest ${Math.round((1 - trainFraction) * 100)}% test, then one pooled ridge`,
      accounts: accounts.length,
      referenceAccount: reference ?? 'n/a',
      accountFeatures: dummyNames.length > 0 ? dummyNames.join(', ') : 'none (single account; pooled matches per-account)',
      window: prepare.window,
      minHistory: prepare.minHistory,
      minAgeDays: prepare.minAgeDays,
      timezone,
      asOf: asOf.toISOString(),
      gate: `same raw-MAE gate as the per-account model (train>=${MIN_TRAIN}, test>=${MIN_TEST}, Spearman>0 and above the baseline, MAE at least ${MIN_MAE_IMPROVEMENT * 100}% lower). Not relaxed. log-MAE stays reported only`,
      quotedImpressions: prepare.quotedImpressions
        ? 'on (q_rel_imp). Fetch-time quoted impressions are partly leaky; live use must read them at compose time'
        : 'off',
      followers: followersIncluded
        ? 'log1p_followers kept (it varies inside at least one account)'
        : 'log1p_followers dropped (constant inside every account, so it would copy the account intercept)',
      shipping: 'A pooled fit is not stored for the extension. Live numbers still require the per-account raw-MAE gate.',
    },
    accounts: accountReports,
    pooled: {
      impressions: pooledFit.impressions.report,
      engagement: pooledFit.engagement.report,
    },
    featuresUsed: pooledNames,
    quotedImpressions: prepare.quotedImpressions ?? false,
    followersIncluded,
    referenceAccount: reference,
  };
}
