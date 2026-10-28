import { SIGNAL_NAMES, type SignalName } from '@reach/shared-types';
import { ScoreEngine } from '../engine';
import { SPECIFIC_NUMBER_REGEX, wordCount } from '../signals/_helpers';

const engine = new ScoreEngine();

export const TEXT_FEATURE_KEYS = [
  'log1p_chars',
  'word_count',
  'newline_count',
  'paragraph_breaks',
  'specific_number_count',
  'any_number_count',
  'link_count',
  'has_link',
  'has_question',
  'has_image',
  'has_video',
  'is_quote',
  'lang_en',
  'lang_tr',
  'lang_other',
  'hour_sin',
  'hour_cos',
  'dow_sin',
  'dow_cos',
  'log1p_hours_since_prev',
  'posts_last_24h',
  'log_baseline_impressions',
  'log_baseline_engagement',
  'log1p_followers',
  'q_present',
  'q_rel_imp',
  'q_log_followers',
  'q_log_age_h',
  'q_self',
] as const;

/**
 * Opt-in columns. Hour/day sine waves, hours since the previous post, posts
 * in the last 24h, has_question, language, and quoted-author followers are
 * already in the base set. These add the coarser versions the ablation asked
 * for. They stay out of the default model until a sealed holdout says otherwise.
 */
export const EXTENDED_FEATURE_KEYS = [
  'len_mid',
  'len_long',
  'has_number',
  'log1p_hook',
  'is_weekend',
  'hour_block',
  'q_rel_author',
  'log_ewma_gap',
  'is_self_reply',
] as const;

export interface FeatureListOptions {
  /**
   * Include fetch-time quoted impressions (`q_rel_imp`).
   * Off unless a backtest asks for it: the count is measured after the quote
   * exists, so the quote itself has already added views.
   */
  quotedImpressions?: boolean;
  /** Length buckets, hook length, weekend, type EWMA, quote relative size. */
  extended?: boolean;
}

export function orderedFeatureNames(options?: FeatureListOptions): string[] {
  const text = options?.quotedImpressions
    ? TEXT_FEATURE_KEYS
    : TEXT_FEATURE_KEYS.filter((key) => key !== 'q_rel_imp');
  const extra = options?.extended ? EXTENDED_FEATURE_KEYS : [];
  return [...SIGNAL_NAMES.map((name) => `sig_${name}`), ...text, ...extra];
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedHourDow(date: Date, timeZone: string): { hour: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hour === 24) hour = 0;
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  return { hour, dow: DOW[weekday] ?? 0 };
}

const TOPIC_STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'your', 'just',
  'about', 'they', 'what', 'when', 'will', 'been', 'were', 'would', 'could',
  'should', 'there', 'their', 'into', 'than', 'then', 'them', 'also', 'more',
  'very', 'really', 'http', 'https', 'like', 'some', 'post', 'tweet',
]);

/** Tokens in the same shape `topic_consistency` compares against recentTopics. */
export function topicTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !TOPIC_STOP.has(t));
}

export function guessLang(text: string): string {
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) return 'tr';
  if (/[a-z]/i.test(text)) return 'en';
  return 'und';
}

const NON_EXTERNAL_HOST =
  /^(?:mobile\.)?(?:twitter\.com|x\.com|pic\.twitter\.com|pic\.x\.com|pbs\.twimg\.com|video\.twimg\.com)$/i;

/** Counts URLs that leave X. pic/twimg hosts and twitter.com / x.com links do not count. Bare t.co stays, because the expansion is unknown. */
export function externalLinkCount(text: string): number {
  const matches = text.match(/https?:\/\/\S+/gi) ?? [];
  let count = 0;
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;!?]+$/g, '');
    let host = '';
    try {
      host = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }
    if (NON_EXTERNAL_HOST.test(host)) continue;
    count++;
  }
  return count;
}

function countMatches(text: string, source: string, flags: string): number {
  const re = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
  return [...text.matchAll(re)].length;
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export interface ScoredPost {
  checklistScore: number;
  signals: Record<string, number>;
  curiosityGap: boolean;
  automatedSpam: boolean;
}

export function scorePost(input: {
  text: string;
  hasImage: boolean;
  hasVideo: boolean;
  isQuote: boolean;
  postsToday: number;
  recentTopics: string[];
}): ScoredPost {
  const mediaType = input.hasVideo ? 'video' : input.hasImage ? 'image' : undefined;
  const result = engine.evaluate({
    text: input.text,
    platform: 'x',
    isThread: false,
    hasMedia: input.hasImage || input.hasVideo,
    mediaType,
    isQuoteTweet: input.isQuote,
    postsToday: input.postsToday,
    recentTopics: input.recentTopics,
  });
  const signals: Record<string, number> = {};
  for (const name of SIGNAL_NAMES) {
    signals[`sig_${name as SignalName}`] = result.signalScores[name].score;
  }
  return {
    checklistScore: result.score,
    signals,
    curiosityGap: result.signalScores.click.firedRules.includes('curiosity_gap'),
    automatedSpam: result.signalScores.report.firedRules.includes('automated_spam_markers'),
  };
}

export interface QuoteParts {
  /** Quoted post had a finite impression count at feature-build time. */
  metricsPresent: boolean;
  impressions: number | null;
  authorFollowers: number | null;
  ageHours: number | null;
  selfQuote: boolean;
}

export interface FeatureParts {
  text: string;
  signals: Record<string, number>;
  createdAt: Date;
  timeZone: string;
  hasImage: boolean;
  hasVideo: boolean;
  isQuote: boolean;
  lang: string;
  hoursSincePrev: number;
  postsLast24h: number;
  baselineImpressions: number;
  baselineEngagement: number;
  followerCount: number | null;
  /** Known at compose time. Fetch-time quoted impressions stay behind the toggle. */
  quote?: QuoteParts | null;
  quotedImpressions?: boolean;
  selfReply?: boolean;
}

export function buildFeatureRecord(parts: FeatureParts): Record<string, number> {
  const text = parts.text;
  const { hour, dow } = zonedHourDow(parts.createdAt, parts.timeZone);
  const lang = (parts.lang || 'und').toLowerCase();
  const rec: Record<string, number> = { ...parts.signals };
  rec.log1p_chars = finite(Math.log1p(text.length));
  rec.word_count = wordCount(text);
  rec.newline_count = countMatches(text, '\\n', 'g');
  rec.paragraph_breaks = countMatches(text, '\\n\\s*\\n', 'g');
  rec.specific_number_count = countMatches(text, SPECIFIC_NUMBER_REGEX.source, SPECIFIC_NUMBER_REGEX.flags);
  rec.any_number_count = countMatches(text, '\\d+(?:\\.\\d+)?%?', 'g');
  rec.link_count = externalLinkCount(text);
  rec.has_link = rec.link_count > 0 ? 1 : 0;
  rec.has_question = text.includes('?') ? 1 : 0;
  rec.has_image = parts.hasImage ? 1 : 0;
  rec.has_video = parts.hasVideo ? 1 : 0;
  rec.is_quote = parts.isQuote ? 1 : 0;
  rec.lang_en = lang === 'en' ? 1 : 0;
  rec.lang_tr = lang === 'tr' ? 1 : 0;
  rec.lang_other = lang !== 'en' && lang !== 'tr' ? 1 : 0;
  rec.hour_sin = Math.sin((2 * Math.PI * hour) / 24);
  rec.hour_cos = Math.cos((2 * Math.PI * hour) / 24);
  rec.dow_sin = Math.sin((2 * Math.PI * dow) / 7);
  rec.dow_cos = Math.cos((2 * Math.PI * dow) / 7);
  rec.log1p_hours_since_prev = finite(Math.log1p(Math.max(0, parts.hoursSincePrev)));
  rec.posts_last_24h = parts.postsLast24h;
  rec.log_baseline_impressions = finite(Math.log(Math.max(parts.baselineImpressions, 1)));
  rec.log_baseline_engagement = finite(Math.log(parts.baselineEngagement + 1e-3));
  rec.log1p_followers =
    parts.followerCount != null && parts.followerCount > 0 ? finite(Math.log1p(parts.followerCount)) : 0;
  const quote = parts.quote;
  const quotedKnown = !!quote?.metricsPresent && quote.impressions != null;
  rec.q_present = parts.isQuote && quotedKnown ? 1 : 0;
  rec.q_rel_imp =
    parts.quotedImpressions && rec.q_present === 1
      ? finite(Math.log((quote!.impressions ?? 0) + 1) - Math.log(Math.max(parts.baselineImpressions, 1)))
      : 0;
  rec.q_log_followers =
    quote?.authorFollowers != null ? finite(Math.log1p(Math.max(0, quote.authorFollowers))) : 0;
  rec.q_log_age_h = quote?.ageHours != null ? finite(Math.log1p(Math.max(0, quote.ageHours))) : 0;
  rec.q_self = quote?.selfQuote ? 1 : 0;
  const firstLine = text.split('\n')[0] ?? '';
  rec.log1p_hook = finite(Math.log1p(firstLine.trim().length));
  rec.has_number = rec.any_number_count > 0 ? 1 : 0;
  rec.len_mid = text.length >= 80 && text.length < 180 ? 1 : 0;
  rec.len_long = text.length >= 180 ? 1 : 0;
  rec.is_weekend = dow === 0 || dow === 6 ? 1 : 0;
  rec.hour_block = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
  rec.q_rel_author = 0;
  rec.log_ewma_gap = 0;
  rec.is_self_reply = parts.selfReply ? 1 : 0;
  for (const key of Object.keys(rec)) rec[key] = finite(rec[key]!);
  return rec;
}

/**
 * Old shipped forecast, evaluated on the same rolling baseline so its error
 * is comparable. Timing follows the extension: peak/good UTC windows → 1.25,
 * every other hour → 1.12, because a later window always exists so the 0.85
 * off-peak branch never ran. Video 1.15 and image 1.35 are the extension
 * constants (the README's 1.45 video figure was already stale). Trending,
 * account health, and the global correction factor are not knowable from a
 * post file and stay at 1.
 */
const UTC_PEAK_OR_GOOD = new Set([
  '2:9', '2:10', '2:11',
  '3:9', '3:10', '3:11', '3:12',
  '4:9', '4:10', '4:11', '4:12',
  '5:9', '5:10', '5:11',
]);

export function legacyTimeMultiplier(date: Date): number {
  const key = `${date.getUTCDay()}:${date.getUTCHours()}`;
  return UTC_PEAK_OR_GOOD.has(key) ? 1.25 : 1.12;
}

export function legacyHeuristicImpressions(input: {
  baseline: number;
  score: number;
  hasImage: boolean;
  hasVideo: boolean;
  curiosityGap: boolean;
  text: string;
  createdAt: Date;
}): number {
  const media = input.hasVideo ? 1.15 : input.hasImage ? 1.35 : 1;
  const link = input.curiosityGap && /https?:\/\//i.test(input.text) ? 1.18 : 1;
  return input.baseline * (input.score / 50) * media * legacyTimeMultiplier(input.createdAt) * link;
}
