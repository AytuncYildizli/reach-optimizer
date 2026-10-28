import type {
  AccountReachModel,
  DraftScore,
  DraftScoreMeta,
  ReachFactor,
  ReachRange,
  ReachSuggestion,
} from '@reach/shared-types';
import { fitBreakoutHead } from './breakout';
import { prepareDataset, type HistoryPost, type ModelRow } from './dataset';
import { buildFeatureRecord, externalLinkCount, guessLang, scorePost, topicTokens, zonedHourDow } from './features';
import { reachFeatureRecord } from './reach-features';
import { predictLogistic } from './ridge';
import { wordCount } from '../signals/_helpers';
import { reconstructFit, runStudy, type ShippedFit } from './study';

/**
 * Per-account reach model. The config is chosen the way `runStudy` chooses it:
 * largest raw-MAE gain on a training-only slice, then one gate on the newer
 * posts that slice never saw. The gate thresholds are unchanged. Weights are
 * written either way; a failed gate still withholds every range.
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
  const rec: Record<string, number> = {
    log1p_chars: finite(Math.log1p(text.length)),
    word_count: wordCount(text),
    newline_count: (text.match(/\n/g) ?? []).length,
    has_question: text.includes('?') ? 1 : 0,
    has_link: externalLinkCount(text) > 0 ? 1 : 0,
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


const INCLUDE_SELF: Record<string, boolean> = {
  self_reply_extended_shrink: true,
};

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
  const scoped = posts
    .filter((post) => (post.account?.trim() || account) === account)
    .map((post) => ({ ...post, account }));

  const study = runStudy(scoped, {
    timezone,
    asOf,
    minAgeDays,
    window,
    minHistory,
    trainFraction,
    trainedAt: options.trainedAt,
  });
  const prepared = prepareDataset(scoped, {
    timezone,
    asOf,
    minAgeDays,
    window,
    minHistory,
    quotedImpressions: false,
    includeSelfReplies: INCLUDE_SELF[study.chosen] === true,
  });
  const fit = study.shipped;
  const passed = study.holdout.passed;
  const topWeights = fit.featureNames
    .map((name, index) => ({ name, weight: fit.weights[index] ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);
  const eligible = prepared.eligible;
  const model: AccountReachModel = {
    kind: 'account-log-impressions',
    version: 1,
    status: passed ? 'calibrated' : 'uncalibrated',
    reason: study.holdout.reason,
    account,
    timezone,
    trainedAt: (options.trainedAt ?? new Date()).toISOString(),
    config: fit.config,
    predictTarget: fit.target,
    loss: fit.loss,
    shrinkK: fit.shrinkK,
    featureNames: fit.featureNames,
    mean: fit.mean,
    std: fit.std,
    weights: fit.weights,
    intercept: fit.intercept,
    boost: fit.boost,
    residualQ10: fit.residualQ10,
    residualQ90: fit.residualQ90,
    lambda: fit.lambda,
    baselineImpressions: prepared.nextContext.baselineImpressions,
    baselineEngagement: prepared.nextContext.baselineEngagement,
    ewmaByKind: prepared.nextContext.ewmaByKind,
    latestPostAt: prepared.nextContext.latestPostAt,
    recentPostAts: prepared.nextContext.recentPostAts,
    recentTopics: prepared.nextContext.recentTopics,
    trailingSelfReplies: prepared.nextContext.trailingSelfReplies,
    breakout: breakoutHead(prepared.rows, trainFraction, fit.featureNames, fit.lambda),
    topWeights,
    selection: study.table.map((row) => ({
      config: row.config,
      maeGain: row.maeGain,
      spearman: row.spearman,
      detail: row.detail,
    })),
    validation: {
      passed: study.holdout.passed,
      reason: study.holdout.reason,
      trainN: study.holdout.trainN,
      testN: study.holdout.testN,
      spearman: study.holdout.spearman,
      mae: study.holdout.mae,
      baselineSpearman: study.holdout.baselineSpearman,
      baselineMae: study.holdout.baselineMae,
      maeLog: study.holdout.maeLog,
      baselineMaeLog: study.holdout.baselineMaeLog,
      coverage80: study.holdout.coverage80,
    },
  };
  return {
    model,
    dropped: prepared.dropped,
    eligiblePosts: eligible.length,
    modeledPosts: prepared.rows.length,
    featuresUsed: fit.featureNames,
    span: eligible.length > 0 ? [eligible[0]!.createdAt, eligible[eligible.length - 1]!.createdAt] : null,
  };
}

function breakoutHead(rows: ModelRow[], trainFraction: number, featureNames: string[], lambda: number) {
  const cut = Math.floor(rows.length * trainFraction);
  return fitBreakoutHead(rows.slice(0, cut), rows.slice(cut), featureNames, lambda);
}

function withheld(reason: string): DraftScore {
  return {
    status: 'withheld',
    range: null,
    confidence: 0,
    topFactors: [],
    suggestions: [],
    breakoutProbability: null,
    reason,
  };
}

export function parseAccountModel(data: unknown): AccountReachModel | null {
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!rec) return null;
  if (rec.kind !== 'account-log-impressions' || rec.version !== 1) return null;
  if (rec.status !== 'calibrated' && rec.status !== 'uncalibrated') return null;
  if (typeof rec.timezone !== 'string' || typeof rec.reason !== 'string') return null;
  if (!Array.isArray(rec.featureNames) || !Array.isArray(rec.weights)) return null;
  return rec as unknown as AccountReachModel;
}

function draftFlags(meta: DraftScoreMeta): { hasImage: boolean; hasVideo: boolean; mediaType: 'image' | 'video' | 'gif' | null } {
  if (meta.mediaType === 'video') return { hasImage: false, hasVideo: true, mediaType: 'video' };
  if (meta.mediaType === 'gif') return { hasImage: true, hasVideo: false, mediaType: 'gif' };
  if (meta.mediaType === 'poll') return { hasImage: false, hasVideo: false, mediaType: null };
  if (meta.mediaType === 'image' || meta.hasMedia) return { hasImage: true, hasVideo: false, mediaType: 'image' };
  return { hasImage: false, hasVideo: false, mediaType: null };
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

function kindEwma(model: AccountReachModel, isQuote: boolean, isThread: boolean): number | null {
  const table = model.ewmaByKind ?? { original: null, quote: null, reply: null };
  if (isQuote) return table.quote;
  if (isThread) return table.reply;
  return table.original;
}

function draftFeatures(
  model: AccountReachModel,
  text: string,
  meta: DraftScoreMeta,
  when: Date,
  flags: { hasImage: boolean; hasVideo: boolean; mediaType: 'image' | 'video' | 'gif' | null },
): Record<string, number> {
  const nowMs = when.getTime();
  const recent = (model.recentPostAts ?? [])
    .map((stamp) => Date.parse(stamp))
    .filter((stamp) => !Number.isNaN(stamp));
  const postsLast24h = recent.filter((stamp) => nowMs - stamp <= 24 * 60 * 60 * 1000 && nowMs - stamp >= 0).length;
  const latest = model.latestPostAt ? Date.parse(model.latestPostAt) : Number.NaN;
  const hoursSincePrev = Number.isNaN(latest) ? 24 : Math.max(0, (nowMs - latest) / 36e5);
  const isQuote = meta.isQuote ?? false;
  const isThread = meta.isThread ?? false;
  const scored = scorePost({
    text,
    hasImage: flags.hasImage,
    hasVideo: flags.hasVideo,
    isQuote,
    postsToday: postsLast24h,
    recentTopics: model.recentTopics ?? [],
  });
  const baseline = model.baselineImpressions ?? 1;
  const features = buildFeatureRecord({
    text,
    signals: scored.signals,
    createdAt: when,
    timeZone: model.timezone,
    hasImage: flags.hasImage,
    hasVideo: flags.hasVideo,
    isQuote,
    lang: guessLang(text),
    hoursSincePrev,
    postsLast24h,
    baselineImpressions: baseline,
    baselineEngagement: model.baselineEngagement ?? 0,
    followerCount: null,
    selfReply: isThread,
  });
  const ewma = kindEwma(model, isQuote, isThread);
  features.log_ewma_gap =
    ewma != null ? Math.log(Math.max(ewma, 1e-6)) - Math.log(Math.max(baseline, 1)) : 0;
  features.q_rel_author = 0;
  const threadPos = isThread ? (model.trailingSelfReplies ?? 0) + 1 : 0;
  const extra = reachFeatureRecord({
    text,
    lang: guessLang(text),
    mediaType: flags.mediaType,
    threadPos,
  });
  for (const key of Object.keys(extra)) features[key] = extra[key]!;
  return features;
}

function breakoutProbabilityOf(model: AccountReachModel, features: Record<string, number>): number | null {
  const head = model.breakout;
  if (!head || !(head.auc > 0.65)) return null;
  const row = head.featureNames.map((name) => features[name] ?? 0);
  const probability = predictLogistic(
    { mean: head.mean, std: head.std, weights: head.weights, intercept: head.intercept },
    [row],
  )[0];
  if (probability == null || !Number.isFinite(probability)) return null;
  return Math.round(Math.max(0, Math.min(1, probability)) * 1000) / 1000;
}

function pointOf(
  model: AccountReachModel,
  features: Record<string, number>,
  isQuote: boolean,
  isThread: boolean,
): number {
  const baseline = model.baselineImpressions ?? 1;
  return reconstructFit(
    {
      target: model.predictTarget ?? 'absolute',
      loss: model.loss ?? 'squared',
      shrinkK: model.shrinkK ?? 1,
      featureNames: model.featureNames,
      mean: model.mean,
      std: model.std,
      weights: model.weights,
      intercept: model.intercept,
      boost: model.boost as ShippedFit['boost'],
    },
    features,
    baseline,
    kindEwma(model, isQuote, isThread),
  );
}

function rangeAround(model: AccountReachModel, point: number): ReachRange {
  const low = point * Math.exp(model.residualQ10);
  const high = point * Math.exp(model.residualQ90);
  const a = Math.max(1, Math.round(Math.min(low, high)));
  const b = Math.max(a, Math.round(Math.max(low, high)));
  return { low: a, high: b };
}

function confidenceOf(model: AccountReachModel): number {
  const coverage = model.validation?.coverage80;
  if (coverage == null) return 0;
  const sample = Math.min(1, (model.validation?.testN ?? 0) / 40);
  return Math.round(coverage * sample * 1000) / 1000;
}

function factorLabel(name: string): string {
  if (FACTOR_LABELS[name]) return FACTOR_LABELS[name];
  if (name.startsWith('sig_')) return name.slice(4).replace(/_/g, ' ');
  return name.replace(/_/g, ' ');
}

function topFactors(model: AccountReachModel, features: Record<string, number>): ReachFactor[] {
  if (model.loss === 'gbt' || model.loss === 'none' || model.weights.length === 0) return [];
  const folded = new Map<string, number>();
  for (let j = 0; j < model.featureNames.length; j++) {
    const name = model.featureNames[j]!;
    const std = model.std[j] ?? 0;
    if (!(std > 0)) continue;
    const contribution = (model.weights[j] ?? 0) * (((features[name] ?? 0) - (model.mean[j] ?? 0)) / std);
    const label = factorLabel(name);
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

function suggestionsFor(
  model: AccountReachModel,
  text: string,
  meta: DraftScoreMeta,
  when: Date,
  flags: { hasImage: boolean; hasVideo: boolean; mediaType: 'image' | 'video' | 'gif' | null },
  current: ReachRange,
  currentPoint: number,
): ReachSuggestion[] {
  if (!(currentPoint > 0) || model.predictTarget === 'ewma' || model.loss === 'none') return [];
  const out: ReachSuggestion[] = [];
  const consider = (id: string, label: string, nextMeta: DraftScoreMeta, nextFlags: { hasImage: boolean; hasVideo: boolean; mediaType: 'image' | 'video' | 'gif' | null }, nextWhen: Date) => {
    const features = draftFeatures(model, text, nextMeta, nextWhen, nextFlags);
    const point = pointOf(model, features, nextMeta.isQuote ?? false, nextMeta.isThread ?? false);
    if ((point - currentPoint) / currentPoint < MIN_SUGGESTION_LIFT) return;
    const range = rangeAround(model, point);
    if (range.low === current.low && range.high === current.high) return;
    out.push({ id, text: label, range });
  };

  if (!flags.hasImage && !flags.hasVideo) {
    consider('add-image', 'An image is associated with a higher range on your past posts.', meta, { hasImage: true, hasVideo: false, mediaType: 'image' }, when);
    consider('add-video', 'A video is associated with a higher range on your past posts.', meta, { hasImage: false, hasVideo: true, mediaType: 'video' }, when);
  } else if (flags.hasImage && !flags.hasVideo) {
    consider('remove-image', 'Posts without an image are associated with a higher range on your past posts.', meta, { hasImage: false, hasVideo: false, mediaType: null }, when);
  } else if (flags.hasVideo) {
    consider('remove-video', 'Posts without a video are associated with a higher range on your past posts.', meta, { hasImage: false, hasVideo: false, mediaType: null }, when);
  }

  const bare = draftFeatures(model, text, meta, when, flags);
  if ((bare.hashtag_count ?? 0) < 1) {
    const withTag = `${text} #note`;
    const tagged = draftFeatures(model, withTag, meta, when, flags);
    const point = pointOf(model, tagged, meta.isQuote ?? false, meta.isThread ?? false);
    if (currentPoint > 0 && (point - currentPoint) / currentPoint >= MIN_SUGGESTION_LIFT) {
      const range = rangeAround(model, point);
      if (range.low !== current.low || range.high !== current.high) {
        out.push({
          id: 'add-hashtag',
          text: 'One hashtag is associated with a higher range on your past posts. This does not choose the tag.',
          range,
        });
      }
    }
  } else {
    const stripped = text.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    const features = draftFeatures(model, stripped, meta, when, flags);
    const point = pointOf(model, features, meta.isQuote ?? false, meta.isThread ?? false);
    if (currentPoint > 0 && (point - currentPoint) / currentPoint >= MIN_SUGGESTION_LIFT) {
      const range = rangeAround(model, point);
      if (range.low !== current.low || range.high !== current.high) {
        out.push({ id: 'drop-hashtag', text: 'Fewer hashtags are associated with a higher range on your past posts.', range });
      }
    }
  }

  if ((bare.has_link ?? 0) >= 1) {
    const stripped = text.replace(/https?:\/\/\S+/gi, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    const features = draftFeatures(model, stripped, meta, when, flags);
    const point = pointOf(model, features, meta.isQuote ?? false, meta.isThread ?? false);
    if (currentPoint > 0 && (point - currentPoint) / currentPoint >= MIN_SUGGESTION_LIFT) {
      const range = rangeAround(model, point);
      if (range.low !== current.low || range.high !== current.high) {
        out.push({ id: 'remove-link', text: 'No link is associated with a higher range on your past posts.', range });
      }
    }
  }

  let best: { when: Date; point: number } | null = null;
  for (let step = 1; step <= 24 * 7; step++) {
    const nextWhen = new Date(when.getTime() + step * 60 * 60 * 1000);
    const features = draftFeatures(model, text, meta, nextWhen, flags);
    const point = pointOf(model, features, meta.isQuote ?? false, meta.isThread ?? false);
    if (!best || point > best.point) best = { when: nextWhen, point };
  }
  if (best && currentPoint > 0 && (best.point - currentPoint) / currentPoint >= MIN_SUGGESTION_LIFT) {
    const range = rangeAround(model, best.point);
    if (range.low !== current.low || range.high !== current.high) {
      out.push({
        id: 'later-hour',
        text: `Posting around ${formatWhen(best.when, model.timezone)} is associated with a higher range on your past posts.`,
        range,
      });
    }
  }
  return out;
}

/**
 * Score one draft. A range is returned only when the shipped config passed
 * the time-split gate. Weights may still be present on a withheld model.
 */
export function score(draftText: string, meta: DraftScoreMeta = {}): DraftScore {
  const model = meta.model;
  if (!model) {
    return withheld('Uncalibrated. A reach number is shown only after a model trained on your own posts beats your usual reach.');
  }
  if (model.kind !== 'account-log-impressions' || model.version !== 1) {
    return withheld('This file is not an account reach model.');
  }
  if (model.status !== 'calibrated') {
    return withheld(model.reason || 'Uncalibrated. Reach numbers stay hidden until the model beats your rolling median on held-out posts.');
  }
  const text = draftText ?? '';
  const flags = draftFlags(meta);
  if (text.trim().length < 1 && !flags.hasImage && !flags.hasVideo) {
    return withheld('Not enough text to score.');
  }
  const now = resolveNow(meta.now);
  if (!now) return withheld('The scoring time is not a valid date.');
  const ridge = model.loss !== 'gbt' && model.loss !== 'none';
  if (ridge && (model.mean.length !== model.featureNames.length || model.std.length !== model.featureNames.length || model.weights.length !== model.featureNames.length)) {
    return withheld('The model file is incomplete, so no range is shown.');
  }
  let features: Record<string, number>;
  try {
    assertTimeZone(model.timezone);
    features = draftFeatures(model, text, meta, now, flags);
  } catch {
    return withheld('The model timezone is not usable.');
  }
  const point = pointOf(model, features, meta.isQuote ?? false, meta.isThread ?? false);
  if (!Number.isFinite(point) || !(point > 0)) return withheld('The model did not produce a finite range.');
  const range = rangeAround(model, point);
  return {
    status: 'scored',
    range,
    confidence: confidenceOf(model),
    topFactors: topFactors(model, features),
    suggestions: suggestionsFor(model, text, meta, now, flags, range, point),
    breakoutProbability: breakoutProbabilityOf(model, features),
    reason: model.reason,
  };
}
