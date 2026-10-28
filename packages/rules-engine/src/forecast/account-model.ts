import type {
  AccountReachModel,
  AccountReachValidation,
  DraftScore,
  DraftScoreMeta,
  ReachFactor,
  ReachRange,
  ReachSuggestion,
} from '@reach/shared-types';
import type { HistoryPost } from './dataset';
import { topicTokens, zonedHourDow } from './features';
import { wordCount } from '../signals/_helpers';
import {
  evaluateExamples,
  judgeTarget,
  MIN_TEST,
  MIN_TRAIN,
  varyingFeatureNames,
  type Example,
} from './model';
import { median } from './stats';

/**
 * Ridge regression on log impressions for one account.
 * Features are text, format, length, media, time of day, topic, and hashtags.
 * The rolling median is the baseline the gate has to beat. It is not a feature.
 * Nothing here posts, and nothing here rewrites the draft.
 */

export const ACCOUNT_FEATURE_KEYS = [
  'log1p_chars',
  'word_count',
  'newline_count',
  'has_question',
  'has_link',
  'has_image',
  'has_video',
  'hashtag_count',
  'is_quote',
  'is_thread',
  'topic_overlap',
  'hour_sin',
  'hour_cos',
  'dow_sin',
  'dow_cos',
] as const;

const HASHTAG_CAP = 4;
const MIN_SUGGESTION_LIFT = 0.05;
const TOPIC_MEMORY = 400;
const RECENT_TOPIC_CAP = 200;
const RECENT_POST_CAP = 40;

const FACTOR_LABELS: Record<string, string> = {
  log1p_chars: 'length',
  word_count: 'word count',
  newline_count: 'line breaks',
  has_question: 'question',
  has_link: 'link',
  has_image: 'image',
  has_video: 'video',
  hashtag_count: 'hashtags',
  is_quote: 'quote',
  is_thread: 'thread',
  topic_overlap: 'topic match',
  hour_sin: 'time of day',
  hour_cos: 'time of day',
  dow_sin: 'day of week',
  dow_cos: 'day of week',
};

export interface TrainAccountOptions {
  timezone?: string;
  asOf?: Date;
  minAgeDays?: number;
  window?: number;
  minHistory?: number;
  trainFraction?: number;
  account?: string;
  trainedAt?: Date;
}

export interface TrainAccountResult {
  model: AccountReachModel;
  dropped: Record<string, number>;
  eligiblePosts: number;
  modeledPosts: number;
  featuresUsed: string[];
  span: [string, string] | null;
}

export interface AccountFeatureInput {
  text: string;
  createdAt: Date;
  timeZone: string;
  hasImage: boolean;
  hasVideo: boolean;
  isQuote: boolean;
  isThread: boolean;
  recentTopics: string[];
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export function hashtagCount(text: string): number {
  const stripped = text.replace(/https?:\/\/\S+/g, ' ');
  const found = stripped.match(/#[\p{L}\p{N}_]+/gu);
  return Math.min(HASHTAG_CAP, found?.length ?? 0);
}

export function topicOverlap(text: string, recentTopics: string[]): number {
  const tokens = topicTokens(text);
  if (tokens.length === 0 || recentTopics.length === 0) return 0;
  const bag = new Set(recentTopics);
  let hit = 0;
  for (const token of tokens) if (bag.has(token)) hit++;
  return hit / tokens.length;
}

export function buildAccountFeatures(input: AccountFeatureInput): Record<string, number> {
  const text = input.text;
  const { hour, dow } = zonedHourDow(input.createdAt, input.timeZone);
  const links = text.match(/https?:\/\/\S+/gi);
  const rec: Record<string, number> = {
    log1p_chars: finite(Math.log1p(text.length)),
    word_count: wordCount(text),
    newline_count: (text.match(/\n/g) ?? []).length,
    has_question: text.includes('?') ? 1 : 0,
    has_link: links && links.length > 0 ? 1 : 0,
    has_image: input.hasImage ? 1 : 0,
    has_video: input.hasVideo ? 1 : 0,
    hashtag_count: hashtagCount(text),
    is_quote: input.isQuote ? 1 : 0,
    is_thread: input.isThread ? 1 : 0,
    topic_overlap: topicOverlap(text, input.recentTopics),
    hour_sin: Math.sin((2 * Math.PI * hour) / 24),
    hour_cos: Math.cos((2 * Math.PI * hour) / 24),
    dow_sin: Math.sin((2 * Math.PI * dow) / 7),
    dow_cos: Math.cos((2 * Math.PI * dow) / 7),
  };
  for (const key of ACCOUNT_FEATURE_KEYS) rec[key] = finite(rec[key] ?? 0);
  return rec;
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

function mediaFlags(mediaType: HistoryPost['mediaType']): { hasImage: boolean; hasVideo: boolean } {
  return {
    hasImage: mediaType === 'image' || mediaType === 'gif',
    hasVideo: mediaType === 'video',
  };
}

function blankValidation(reason: string, trainN: number, testN: number): AccountReachValidation {
  return {
    passed: false,
    reason,
    trainN,
    testN,
    spearman: null,
    mae: null,
    baselineSpearman: null,
    baselineMae: null,
    maeLog: null,
    baselineMaeLog: null,
    coverage80: null,
  };
}

function validationFromReport(report: {
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
  coverage80: number | null;
}): AccountReachValidation {
  return {
    passed: report.passed,
    reason: report.reason,
    trainN: report.trainN,
    testN: report.testN,
    spearman: report.spearman,
    mae: report.mae,
    baselineSpearman: report.baselineSpearman,
    baselineMae: report.baselineMae,
    maeLog: report.maeLog,
    baselineMaeLog: report.baselineMaeLog,
    coverage80: report.coverage80,
  };
}

function dedupeKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface ModeledRow {
  id: string;
  createdAt: string;
  impressions: number;
  baseline: number;
  features: Record<string, number>;
}

function rememberTopics(history: string[], text: string): void {
  for (const token of topicTokens(text)) history.push(token);
  if (history.length > TOPIC_MEMORY) history.splice(0, history.length - TOPIC_MEMORY);
}

function uniqueTail(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && out.length < RECENT_TOPIC_CAP; i--) {
    const token = tokens[i]!;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.reverse();
}

export function trainAccountModel(posts: HistoryPost[], options: TrainAccountOptions = {}): TrainAccountResult {
  const timezone = options.timezone ?? 'UTC';
  assertTimeZone(timezone);
  const asOf = options.asOf ?? new Date();
  const minAgeDays = options.minAgeDays ?? 3;
  const window = options.window ?? 20;
  const minHistory = options.minHistory ?? 8;
  const trainFraction = options.trainFraction ?? 0.7;
  if (!(trainFraction > 0.4 && trainFraction < 0.95)) {
    throw new Error('trainFraction must sit between 0.4 and 0.95 so a time-ordered tail stays held out.');
  }
  const accountFilter = options.account?.trim().replace(/^@/, '') ?? '';
  const names = new Set(posts.map((post) => post.account?.trim() || 'account'));
  if (!accountFilter && names.size > 1) {
    throw new Error('This model is per account. Pass account when the file has more than one.');
  }
  const account = accountFilter || [...names][0] || 'account';

  const dropped: Record<string, number> = {
    other_account: 0,
    reply: 0,
    retweet: 0,
    short_text: 0,
    too_recent: 0,
    non_positive_impressions: 0,
    duplicate: 0,
    bad_timestamp: 0,
  };
  const cutoff = asOf.getTime() - minAgeDays * 24 * 60 * 60 * 1000;
  const candidates: HistoryPost[] = [];
  for (const post of posts) {
    const postAccount = post.account?.trim() || account;
    if (postAccount !== account) {
      dropped.other_account = (dropped.other_account ?? 0) + 1;
      continue;
    }
    if (post.kind === 'retweet') {
      dropped.retweet = (dropped.retweet ?? 0) + 1;
      continue;
    }
    if (post.kind === 'reply' && !post.selfReply) {
      dropped.reply = (dropped.reply ?? 0) + 1;
      continue;
    }
    const created = Date.parse(post.createdAt);
    if (Number.isNaN(created)) {
      dropped.bad_timestamp = (dropped.bad_timestamp ?? 0) + 1;
      continue;
    }
    if (post.text.trim().length < 1 && !post.mediaType) {
      dropped.short_text = (dropped.short_text ?? 0) + 1;
      continue;
    }
    if (created >= cutoff) {
      dropped.too_recent = (dropped.too_recent ?? 0) + 1;
      continue;
    }
    if (!(post.impressions > 0)) {
      dropped.non_positive_impressions = (dropped.non_positive_impressions ?? 0) + 1;
      continue;
    }
    candidates.push(post);
  }
  candidates.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const eligible: HistoryPost[] = [];
  for (const post of candidates) {
    const key = dedupeKey(post.text);
    if (key.length > 0 && seen.has(key)) {
      dropped.duplicate = (dropped.duplicate ?? 0) + 1;
      continue;
    }
    if (key.length > 0) seen.add(key);
    eligible.push(post);
  }

  const topicHistory: string[] = [];
  const rows: ModeledRow[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const post = eligible[i]!;
    const prior = eligible.slice(Math.max(0, i - window), i).map((item) => item.impressions);
    const flags = mediaFlags(post.mediaType);
    const features = buildAccountFeatures({
      text: post.text,
      createdAt: new Date(post.createdAt),
      timeZone: timezone,
      hasImage: flags.hasImage,
      hasVideo: flags.hasVideo,
      isQuote: post.kind === 'quote',
      isThread: post.kind === 'reply' && !!post.selfReply,
      recentTopics: topicHistory,
    });
    rememberTopics(topicHistory, post.text);
    if (prior.length < minHistory) continue;
    rows.push({
      id: post.id,
      createdAt: post.createdAt,
      impressions: post.impressions,
      baseline: median(prior),
      features,
    });
  }

  const testStart = Math.floor(rows.length * trainFraction);
  const trainRows = rows.slice(0, testStart);
  const testRows = rows.slice(testStart);
  const featureNames = varyingFeatureNames(trainRows, [...ACCOUNT_FEATURE_KEYS]);
  const toExample = (row: ModeledRow): Example => ({
    id: row.id,
    features: row.features,
    y: Math.log(row.impressions),
    actual: row.impressions,
    baseline: row.baseline,
    heuristic: null,
    checklistScore: 0,
  });

  let validation: AccountReachValidation;
  let shippedWeights: number[] = [];
  let shippedMean: number[] = [];
  let shippedStd: number[] = [];
  let shippedIntercept = 0;
  let residualQ10 = 0;
  let residualQ90 = 0;
  let lambda = 0;
  let usedNames = featureNames;

  if (trainRows.length < MIN_TRAIN || testRows.length < MIN_TEST) {
    validation = blankValidation(
      judgeTarget({
        trainN: trainRows.length,
        testN: testRows.length,
        modelSpearman: null,
        baselineSpearman: null,
        modelMae: null,
        baselineMae: null,
      }).reason,
      trainRows.length,
      testRows.length,
    );
  } else {
    const evaluated = evaluateExamples(
      trainRows.map(toExample),
      testRows.map(toExample),
      featureNames,
      {
        reconstruct: (_row, yhat) => Math.exp(yhat),
        gate: 'raw_mae',
        lambdaLoss: 'raw_mae',
        reportLogMae: true,
      },
      'log_impressions',
    );
    validation = validationFromReport(evaluated.report);
    if (evaluated.report.passed && !evaluated.shipped) {
      validation = { ...validation, passed: false, reason: `${evaluated.report.reason} The passing fit could not be stored.` };
    }
    if (evaluated.shipped && validation.passed) {
      usedNames = evaluated.shipped.featureNames;
      shippedWeights = evaluated.shipped.weights;
      shippedMean = evaluated.shipped.mean;
      shippedStd = evaluated.shipped.std;
      shippedIntercept = evaluated.shipped.intercept;
      residualQ10 = evaluated.shipped.residualQ10;
      residualQ90 = evaluated.shipped.residualQ90;
      lambda = evaluated.shipped.lambda;
    }
  }

  const tail = eligible.slice(-window);
  const baselineImpressions = tail.length > 0 ? median(tail.map((post) => post.impressions)) : null;
  const model: AccountReachModel = {
    kind: 'account-log-impressions',
    version: 1,
    status: validation.passed ? 'calibrated' : 'uncalibrated',
    reason: validation.reason,
    account,
    timezone,
    trainedAt: (options.trainedAt ?? new Date()).toISOString(),
    target: 'log_impressions',
    featureNames: validation.passed ? usedNames : [],
    mean: validation.passed ? shippedMean : [],
    std: validation.passed ? shippedStd : [],
    weights: validation.passed ? shippedWeights : [],
    intercept: validation.passed ? shippedIntercept : 0,
    residualQ10: validation.passed ? residualQ10 : 0,
    residualQ90: validation.passed ? residualQ90 : 0,
    lambda: validation.passed ? lambda : 0,
    baselineImpressions,
    latestPostAt: eligible.length > 0 ? eligible[eligible.length - 1]!.createdAt : null,
    recentPostAts: eligible.slice(-RECENT_POST_CAP).map((post) => post.createdAt),
    recentTopics: uniqueTail(topicHistory),
    validation,
  };

  return {
    model,
    dropped,
    eligiblePosts: eligible.length,
    modeledPosts: rows.length,
    featuresUsed: validation.passed ? usedNames : featureNames,
    span: eligible.length > 0 ? [eligible[0]!.createdAt, eligible[eligible.length - 1]!.createdAt] : null,
  };
}

function withheld(reason: string): DraftScore {
  return {
    status: 'withheld',
    range: null,
    confidence: 0,
    topFactors: [],
    suggestions: [],
    reason,
  };
}

export function parseAccountModel(data: unknown): AccountReachModel | null {
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!rec) return null;
  if (rec.kind !== 'account-log-impressions' || rec.version !== 1) return null;
  if (rec.status !== 'calibrated' && rec.status !== 'uncalibrated') return null;
  if (rec.target !== 'log_impressions') return null;
  if (typeof rec.timezone !== 'string' || typeof rec.reason !== 'string') return null;
  if (!Array.isArray(rec.featureNames) || !Array.isArray(rec.weights)) return null;
  return rec as unknown as AccountReachModel;
}

function project(model: AccountReachModel, features: Record<string, number>): number {
  let y = model.intercept;
  for (let j = 0; j < model.featureNames.length; j++) {
    const std = model.std[j] ?? 0;
    if (!(std > 0)) continue;
    const x = features[model.featureNames[j]!] ?? 0;
    y += (model.weights[j] ?? 0) * ((x - (model.mean[j] ?? 0)) / std);
  }
  return y;
}

function rangeFromLog(model: AccountReachModel, logImpression: number): ReachRange {
  const low = Math.exp(logImpression + model.residualQ10);
  const high = Math.exp(logImpression + model.residualQ90);
  const a = Math.max(1, Math.round(Math.min(low, high)));
  const b = Math.max(a, Math.round(Math.max(low, high)));
  return { low: a, high: b };
}

function confidenceOf(model: AccountReachModel): number {
  const coverage = model.validation.coverage80;
  if (coverage == null) return 0;
  const sample = Math.min(1, model.validation.testN / 40);
  return Math.round(coverage * sample * 1000) / 1000;
}

function draftFlags(meta: DraftScoreMeta): { hasImage: boolean; hasVideo: boolean } {
  if (meta.mediaType === 'video') return { hasImage: false, hasVideo: true };
  if (meta.mediaType === 'poll') return { hasImage: false, hasVideo: false };
  if (meta.mediaType === 'image' || meta.mediaType === 'gif') return { hasImage: true, hasVideo: false };
  if (meta.hasMedia) return { hasImage: true, hasVideo: false };
  return { hasImage: false, hasVideo: false };
}

function resolveNow(value: DraftScoreMeta['now']): Date | null {
  if (value == null) return new Date();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function topFactors(model: AccountReachModel, features: Record<string, number>): ReachFactor[] {
  const folded = new Map<string, number>();
  for (let j = 0; j < model.featureNames.length; j++) {
    const name = model.featureNames[j]!;
    const std = model.std[j] ?? 0;
    if (!(std > 0)) continue;
    const contribution = (model.weights[j] ?? 0) * (((features[name] ?? 0) - (model.mean[j] ?? 0)) / std);
    const label = FACTOR_LABELS[name] ?? name;
    folded.set(label, (folded.get(label) ?? 0) + contribution);
  }
  return [...folded.entries()]
    .filter(([, contribution]) => Math.abs(contribution) >= 0.02)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([name, contribution]) => ({
      name,
      contribution: Math.round(contribution * 1000) / 1000,
      direction: contribution >= 0 ? 'higher' : 'lower',
    }));
}

function pushSuggestion(
  out: ReachSuggestion[],
  current: ReachRange,
  currentCenter: number,
  altLog: number,
  model: AccountReachModel,
  id: string,
  text: string,
): void {
  const center = Math.exp(altLog);
  if (!(currentCenter > 0) || (center - currentCenter) / currentCenter < MIN_SUGGESTION_LIFT) return;
  const range = rangeFromLog(model, altLog);
  if (range.low === current.low && range.high === current.high) return;
  out.push({ id, text, range });
}

function suggestionsFor(
  model: AccountReachModel,
  base: AccountFeatureInput,
  features: Record<string, number>,
  current: ReachRange,
  currentLog: number,
): ReachSuggestion[] {
  const out: ReachSuggestion[] = [];
  const currentCenter = Math.exp(currentLog);
  const attempt = (id: string, text: string, patch: Record<string, number>) => {
    const next: Record<string, number> = { ...features };
    for (const [key, value] of Object.entries(patch)) next[key] = value;
    pushSuggestion(out, current, currentCenter, project(model, next), model, id, text);
  };

  if (!base.hasImage && !base.hasVideo) {
    attempt('add-image', 'An image is associated with a higher range on your past posts.', {
      has_image: 1,
      has_video: 0,
    });
    attempt('add-video', 'A video is associated with a higher range on your past posts.', {
      has_image: 0,
      has_video: 1,
    });
  } else if (base.hasImage && !base.hasVideo) {
    attempt('remove-image', 'Posts without an image are associated with a higher range on your past posts.', {
      has_image: 0,
    });
  } else if (base.hasVideo) {
    attempt('remove-video', 'Posts without a video are associated with a higher range on your past posts.', {
      has_video: 0,
    });
  }

  if ((features.hashtag_count ?? 0) < 1) {
    attempt('add-hashtag', 'One hashtag is associated with a higher range on your past posts. This does not choose the tag.', {
      hashtag_count: 1,
    });
  } else {
    attempt('drop-hashtag', 'Fewer hashtags are associated with a higher range on your past posts.', {
      hashtag_count: 0,
    });
  }

  if ((features.has_link ?? 0) >= 1) {
    attempt('remove-link', 'No link is associated with a higher range on your past posts.', { has_link: 0 });
  }

  let best: { when: Date; log: number } | null = null;
  for (let step = 1; step <= 24 * 7; step++) {
    const when = new Date(base.createdAt.getTime() + step * 60 * 60 * 1000);
    const alt = buildAccountFeatures({ ...base, createdAt: when });
    const log = project(model, alt);
    if (!best || log > best.log) best = { when, log };
  }
  if (best) {
    pushSuggestion(
      out,
      current,
      currentCenter,
      best.log,
      model,
      'later-hour',
      `Posting around ${formatWhen(best.when, model.timezone)} is associated with a higher range on your past posts.`,
    );
  }
  return out;
}

/**
 * Score one draft. Returns a range only when `meta.model` passed the
 * time-split gate. Otherwise the range is null and suggestions are empty.
 */
export function score(draftText: string, meta: DraftScoreMeta = {}): DraftScore {
  const model = meta.model;
  if (!model) {
    return withheld('Uncalibrated. A reach number is shown only after a model trained on your own posts beats your usual reach.');
  }
  if (model.kind !== 'account-log-impressions' || model.version !== 1) {
    return withheld('This file is not an account reach model.');
  }
  if (model.status !== 'calibrated' || model.featureNames.length === 0) {
    return withheld(model.reason || 'Uncalibrated. Reach numbers stay hidden until the model beats your rolling median on held-out posts.');
  }
  const width = model.featureNames.length;
  if (model.mean.length !== width || model.std.length !== width || model.weights.length !== width) {
    return withheld('The model file is incomplete, so no range is shown.');
  }
  const text = draftText ?? '';
  const flags = draftFlags(meta);
  if (text.trim().length < 1 && !flags.hasImage && !flags.hasVideo) {
    return withheld('Not enough text to score.');
  }
  const now = resolveNow(meta.now);
  if (!now) return withheld('The scoring time is not a valid date.');
  let features: Record<string, number>;
  try {
    assertTimeZone(model.timezone);
    features = buildAccountFeatures({
      text,
      createdAt: now,
      timeZone: model.timezone,
      hasImage: flags.hasImage,
      hasVideo: flags.hasVideo,
      isQuote: meta.isQuote ?? false,
      isThread: meta.isThread ?? false,
      recentTopics: model.recentTopics ?? [],
    });
  } catch {
    return withheld('The model timezone is not usable.');
  }
  const logImpression = project(model, features);
  if (!Number.isFinite(logImpression)) return withheld('The model did not produce a finite range.');
  const range = rangeFromLog(model, logImpression);
  const base: AccountFeatureInput = {
    text,
    createdAt: now,
    timeZone: model.timezone,
    hasImage: flags.hasImage,
    hasVideo: flags.hasVideo,
    isQuote: meta.isQuote ?? false,
    isThread: meta.isThread ?? false,
    recentTopics: model.recentTopics ?? [],
  };
  return {
    status: 'scored',
    range,
    confidence: confidenceOf(model),
    topFactors: topFactors(model, features),
    suggestions: suggestionsFor(model, base, features, range, logImpression),
    reason: model.reason,
  };
}
