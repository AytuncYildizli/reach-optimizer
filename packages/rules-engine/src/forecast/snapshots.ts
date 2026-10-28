import { median } from './stats';
import {
  DEFAULT_MIN_HISTORY,
  DEFAULT_TRAIN_FRACTION,
  DEFAULT_WINDOW,
  MIN_MAE_IMPROVEMENT,
  MIN_TEST,
  MIN_TRAIN,
  evaluateExamples,
  varyingFeatureNames,
  type Example,
  type TargetReport,
} from './model';
import { accountDummyName } from './pooled';

/** Ages stored on metric_snapshots. 168 is the 7d outcome. */
export const SNAPSHOT_AGES = [1, 6, 24, 48, 168] as const;
export type SnapshotAge = (typeof SNAPSHOT_AGES)[number];

/**
 * Frozen feature list for a forecast made at 6 hours.
 * 24h and 48h rows are accepted so a Supabase export can include them,
 * and they are not features: they are later than the decision.
 */
export const SNAPSHOT_FEATURE_KEYS = [
  'log_imp_1h_vs_base',
  'log_imp_6h_vs_base',
  'log_imp_6h_vs_1h',
  'eng_1h',
  'eng_6h',
] as const;

const AGE_BY_ALIAS: Record<string, SnapshotAge> = {
  '1': 1,
  '1h': 1,
  '6': 6,
  '6h': 6,
  '24': 24,
  '24h': 24,
  '48': 48,
  '48h': 48,
  '168': 168,
  '168h': 168,
  '7d': 168,
};

export interface SnapshotMetrics {
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
}

export interface SnapshotObservation {
  id: string;
  account: string;
  ageH: SnapshotAge;
  createdAt: string | null;
  metrics: SnapshotMetrics;
}

export interface SnapshotAccountReport {
  account: string;
  modeledPosts: number;
  trainN: number;
  testN: number;
  /** Train-only median of (7d impressions / 1h impressions). */
  multiplier: number | null;
  own: TargetReport;
  pooled: TargetReport;
}

export interface SnapshotBacktestReport {
  protocol: Record<string, string | number>;
  dropped: Record<string, number>;
  modeledPosts: number;
  featuresUsed: string[];
  /** Gated result. One account uses that account's fit; several use the pooled fit. */
  impressions: TargetReport;
  accounts: SnapshotAccountReport[];
}

export interface SnapshotBacktestOptions {
  window?: number;
  minHistory?: number;
  trainFraction?: number;
  /** Used when a row has no account field. */
  account?: string;
}

interface ParsedSnapshots {
  rows: SnapshotObservation[];
  dropped: Record<string, number>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function optionalNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function ageOf(raw: Record<string, unknown>): SnapshotAge | null {
  const alias = raw.target ?? raw.snapshot ?? raw.age ?? raw.age_label;
  if (typeof alias === 'string') {
    const mapped = AGE_BY_ALIAS[alias.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  if (typeof alias === 'number' && AGE_BY_ALIAS[String(alias)]) return AGE_BY_ALIAS[String(alias)]!;
  const hours = optionalNum(raw.age_h ?? raw.ageH ?? raw.age_hours);
  if (hours == null) return null;
  return (SNAPSHOT_AGES as readonly number[]).includes(hours) ? (hours as SnapshotAge) : null;
}

function metricsOf(raw: Record<string, unknown>): SnapshotMetrics | null {
  const nested = asRecord(raw.metrics) ?? asRecord(raw.public_metrics);
  const source = nested ?? raw;
  const impressions = optionalNum(source.impression_count ?? source.impressions ?? source.views);
  if (impressions == null) return null;
  return {
    impressions,
    likes: optionalNum(source.like_count ?? source.likes) ?? 0,
    retweets: optionalNum(source.retweet_count ?? source.retweets) ?? 0,
    replies: optionalNum(source.reply_count ?? source.replies) ?? 0,
    quotes: optionalNum(source.quote_count ?? source.quotes) ?? 0,
    bookmarks: optionalNum(source.bookmark_count ?? source.bookmarks) ?? 0,
  };
}

function blankDropped(): Record<string, number> {
  return {
    bad_row: 0,
    bad_age: 0,
    duplicate_age: 0,
    missing_1h: 0,
    missing_6h: 0,
    missing_7d: 0,
    non_positive: 0,
    warmup: 0,
  };
}

export function parseSnapshotJson(data: unknown, fallbackAccount = 'account'): ParsedSnapshots {
  if (!Array.isArray(data)) throw new Error('Snapshot file must be a JSON array');
  const dropped = blankDropped();
  const rows: SnapshotObservation[] = [];
  for (const item of data) {
    const raw = asRecord(item);
    if (!raw) {
      dropped.bad_row = (dropped.bad_row ?? 0) + 1;
      continue;
    }
    const idValue = raw.id ?? raw.post_id ?? raw.tweet_id;
    const id = idValue != null ? String(idValue) : '';
    if (!id) {
      dropped.bad_row = (dropped.bad_row ?? 0) + 1;
      continue;
    }
    const ageH = ageOf(raw);
    if (ageH == null) {
      dropped.bad_age = (dropped.bad_age ?? 0) + 1;
      continue;
    }
    const metrics = metricsOf(raw);
    if (!metrics) {
      dropped.bad_row = (dropped.bad_row ?? 0) + 1;
      continue;
    }
    const accountRaw = raw.account ?? raw.username ?? raw.author_username;
    const account = typeof accountRaw === 'string' && accountRaw.trim() ? accountRaw.trim().replace(/^@/, '') : fallbackAccount;
    const createdRaw = raw.created_at ?? raw.createdAt ?? raw.observed_at ?? raw.captured_at;
    const createdAt = typeof createdRaw === 'string' && !Number.isNaN(Date.parse(createdRaw)) ? createdRaw : null;
    rows.push({ id, account, ageH, createdAt, metrics });
  }
  return { rows, dropped };
}

interface CompletePost {
  id: string;
  account: string;
  createdAt: string;
  imp1: number;
  imp6: number;
  imp7: number;
  eng1: number;
  eng6: number;
}

function engagement(metrics: SnapshotMetrics): number {
  if (!(metrics.impressions > 0)) return 0;
  return (metrics.likes + metrics.retweets + metrics.replies + metrics.quotes) / metrics.impressions;
}

interface BuiltPost extends CompletePost {
  features: Record<string, number>;
}

function buildAccount(posts: CompletePost[], window: number, minHistory: number, dropped: Record<string, number>): BuiltPost[] {
  const built: BuiltPost[] = [];
  const past1: number[] = [];
  const past6: number[] = [];
  for (const post of posts) {
    if (past1.length < minHistory) {
      dropped.warmup = (dropped.warmup ?? 0) + 1;
    } else {
      const base1 = median(past1.slice(-window));
      const base6 = median(past6.slice(-window));
      built.push({
        ...post,
        features: {
          log_imp_1h_vs_base: Math.log(post.imp1) - Math.log(Math.max(base1, 1e-6)),
          log_imp_6h_vs_base: Math.log(post.imp6) - Math.log(Math.max(base6, 1e-6)),
          log_imp_6h_vs_1h: Math.log(post.imp6) - Math.log(post.imp1),
          eng_1h: post.eng1,
          eng_6h: post.eng6,
        },
      });
    }
    past1.push(post.imp1);
    past6.push(post.imp6);
  }
  return built;
}

function toExample(post: BuiltPost, baseline: number): Example {
  return {
    id: post.id,
    features: post.features,
    y: Math.log(post.imp7) - Math.log(post.imp1),
    actual: post.imp7,
    baseline,
    heuristic: null,
    checklistScore: 0,
  };
}

const SNAPSHOT_EVAL = {
  reconstruct: (row: Example, yhat: number) => row.actual * Math.exp(yhat - row.y),
  gate: 'log_mae' as const,
  lambdaLoss: 'log_mae' as const,
  reportLogMae: true,
};

/**
 * Predict 7d impressions from the 1h and 6h snapshots.
 * The baseline is `impressions_1h × median(impressions_7d / impressions_1h)`
 * with the median taken on that account's training posts only.
 * Pass/fail is log-MAE, not raw MAE. Raw MAE is still on the report.
 */
export function runSnapshotBacktest(data: unknown, options: SnapshotBacktestOptions = {}): SnapshotBacktestReport {
  const window = options.window ?? DEFAULT_WINDOW;
  const minHistory = options.minHistory ?? DEFAULT_MIN_HISTORY;
  const trainFraction = options.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const parsed = parseSnapshotJson(data, options.account ?? 'account');
  const dropped = parsed.dropped;

  const byPost = new Map<string, { account: string; id: string; createdAt: string | null; ages: Map<SnapshotAge, SnapshotMetrics> }>();
  for (const row of parsed.rows) {
    const key = `${row.account}\0${row.id}`;
    const post = byPost.get(key) ?? { account: row.account, id: row.id, createdAt: null, ages: new Map() };
    if (row.createdAt && (!post.createdAt || Date.parse(row.createdAt) < Date.parse(post.createdAt))) {
      post.createdAt = row.createdAt;
    }
    if (post.ages.has(row.ageH)) dropped.duplicate_age = (dropped.duplicate_age ?? 0) + 1;
    post.ages.set(row.ageH, row.metrics);
    byPost.set(key, post);
  }

  const completeByAccount = new Map<string, CompletePost[]>();
  for (const post of byPost.values()) {
    const at1 = post.ages.get(1);
    const at6 = post.ages.get(6);
    const at7 = post.ages.get(168);
    if (!at1) {
      dropped.missing_1h = (dropped.missing_1h ?? 0) + 1;
      continue;
    }
    if (!at6) {
      dropped.missing_6h = (dropped.missing_6h ?? 0) + 1;
      continue;
    }
    if (!at7) {
      dropped.missing_7d = (dropped.missing_7d ?? 0) + 1;
      continue;
    }
    if (!(at1.impressions > 0) || !(at6.impressions > 0) || !(at7.impressions > 0)) {
      dropped.non_positive = (dropped.non_positive ?? 0) + 1;
      continue;
    }
    const list = completeByAccount.get(post.account) ?? [];
    list.push({
      id: post.id,
      account: post.account,
      createdAt: post.createdAt ?? '',
      imp1: at1.impressions,
      imp6: at6.impressions,
      imp7: at7.impressions,
      eng1: engagement(at1),
      eng6: engagement(at6),
    });
    completeByAccount.set(post.account, list);
  }

  const accounts = [...completeByAccount.keys()].sort((a, b) => a.localeCompare(b));
  const reference = accounts[0] ?? null;
  const dummyByAccount = new Map<string, string>();
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
    dummyByAccount.set(account, name);
  }

  interface Split {
    account: string;
    train: BuiltPost[];
    test: BuiltPost[];
    multiplier: number | null;
  }
  const splits: Split[] = [];
  for (const account of accounts) {
    const posts = (completeByAccount.get(account) ?? []).slice().sort((a, b) => {
      const at = Date.parse(a.createdAt);
      const bt = Date.parse(b.createdAt);
      if (Number.isNaN(at) && Number.isNaN(bt)) return a.id.localeCompare(b.id);
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return at - bt || a.id.localeCompare(b.id);
    });
    const built = buildAccount(posts, window, minHistory, dropped);
    const cut = Math.floor(built.length * trainFraction);
    const train = built.slice(0, cut);
    const ratios = train.map((row) => row.imp7 / row.imp1).filter((ratio) => ratio > 0 && Number.isFinite(ratio));
    splits.push({
      account,
      train,
      test: built.slice(cut),
      multiplier: ratios.length > 0 ? median(ratios) : null,
    });
  }

  const decorate = (post: BuiltPost, multiplier: number): Example => {
    const features = { ...post.features };
    for (const name of dummyByAccount.values()) features[name] = 0;
    const dummy = dummyByAccount.get(post.account);
    if (dummy) features[dummy] = 1;
    return toExample({ ...post, features }, post.imp1 * multiplier);
  };

  const stamp = (value: string) => {
    const parsedAt = Date.parse(value);
    return Number.isNaN(parsedAt) ? Number.POSITIVE_INFINITY : parsedAt;
  };
  const byCreated = (a: { post: BuiltPost }, b: { post: BuiltPost }) =>
    stamp(a.post.createdAt) - stamp(b.post.createdAt) || a.post.account.localeCompare(b.post.account) || a.post.id.localeCompare(b.post.id);
  const trainPosts = splits
    .flatMap((split) => split.train.map((post) => ({ post, multiplier: split.multiplier ?? 1 })))
    .sort(byCreated);
  const testPosts = splits
    .flatMap((split) => split.test.map((post) => ({ post, multiplier: split.multiplier ?? 1 })))
    .sort(byCreated);
  const orderedTrain = trainPosts.map((item) => decorate(item.post, item.multiplier));
  const orderedTest = testPosts.map((item) => decorate(item.post, item.multiplier));
  const names = varyingFeatureNames(orderedTrain, [...SNAPSHOT_FEATURE_KEYS, ...dummyByAccount.values()]);
  const pooled = evaluateExamples(orderedTrain, orderedTest, names, SNAPSHOT_EVAL, null);

  const accountReports: SnapshotAccountReport[] = splits.map((split) => {
    const multiplier = split.multiplier ?? 1;
    const train = split.train.map((post) => decorate(post, multiplier));
    const test = split.test.map((post) => decorate(post, multiplier));
    const ownNames = varyingFeatureNames(train, [...SNAPSHOT_FEATURE_KEYS]);
    const own = evaluateExamples(train, test, ownNames, SNAPSHOT_EVAL, null);
    const onAccount = evaluateExamples(orderedTrain, test, names, SNAPSHOT_EVAL, null);
    return {
      account: split.account,
      modeledPosts: split.train.length + split.test.length,
      trainN: split.train.length,
      testN: split.test.length,
      multiplier: split.multiplier,
      own: own.report,
      pooled: onAccount.report,
    };
  });

  const headline = accounts.length <= 1 ? (accountReports[0]?.own ?? pooled.report) : pooled.report;
  return {
    protocol: {
      decision: '7d impressions from the 1h and 6h snapshots',
      features: SNAPSHOT_FEATURE_KEYS.join(', '),
      unusedAges: '24h and 48h are parsed and ignored so an export of metric_snapshots can include every target',
      baseline: 'impressions at 1h times the training-only median of (7d / 1h), per account',
      split: `per account, oldest ${Math.round(trainFraction * 100)}% train, newest ${Math.round((1 - trainFraction) * 100)}% test`,
      gate: `log-MAE at least ${MIN_MAE_IMPROVEMENT * 100}% lower than the 1h multiplier, Spearman>0 and above that baseline, train>=${MIN_TRAIN}, test>=${MIN_TEST}. This rule does not replace the raw-MAE impression gate. It applies when this mode is scored on a fresh forward holdout`,
      rawMae: 'reported, not the gate',
      window,
      minHistory,
      accounts: accounts.length,
      referenceAccount: reference ?? 'n/a',
      shipping: 'Snapshot fits are not written to the compose-time forecast. That surface still uses the per-account raw-MAE gate.',
    },
    dropped,
    modeledPosts: splits.reduce((sum, split) => sum + split.train.length + split.test.length, 0),
    featuresUsed: names,
    impressions: headline,
    accounts: accountReports,
  };
}
