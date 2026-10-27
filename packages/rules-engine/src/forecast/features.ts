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
] as const;

export function orderedFeatureNames(): string[] {
  return [...SIGNAL_NAMES.map((name) => `sig_${name}`), ...TEXT_FEATURE_KEYS];
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
  rec.link_count = countMatches(text, 'https?:\\/\\/\\S+', 'gi');
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
