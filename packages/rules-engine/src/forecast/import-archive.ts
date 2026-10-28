import type { HistoryPost } from './dataset';

/**
 * Join an X archive (`tweets.js`) with a metrics CSV or JSON file.
 * The archive has the text and the clock. Impressions are not in the archive,
 * so a metrics file is required for training. This module never calls the
 * network and never reads a token.
 */

export interface ImportStats {
  archiveTweets: number;
  metricRows: number;
  kept: number;
  droppedRetweet: number;
  droppedReply: number;
  missingMetrics: number;
  unmatchedMetrics: number;
  badArchiveRow: number;
  badMetricRow: number;
  empty: number;
}

export interface ImportResult {
  posts: HistoryPost[];
  stats: ImportStats;
  account: string;
}

export interface ImportInput {
  /** Contents of `tweets.js` (or several parts already concatenated by the caller). */
  archiveText?: string;
  /** CSV or JSON metrics. Required when an archive is present. */
  metricsText?: string;
  /** Handle without @. Used to tell a self-thread from a reply to someone else. */
  account?: string;
}

interface MetricRow {
  id: string;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  text?: string;
  createdAt?: string;
  mediaType?: HistoryPost['mediaType'];
  lang?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function emptyStats(): ImportStats {
  return {
    archiveTweets: 0,
    metricRows: 0,
    kept: 0,
    droppedRetweet: 0,
    droppedReply: 0,
    missingMetrics: 0,
    unmatchedMetrics: 0,
    badArchiveRow: 0,
    badMetricRow: 0,
    empty: 0,
  };
}

function normalizeId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^'+/, '');
  const fromUrl = trimmed.match(/status(?:es)?\/(\d+)/);
  if (fromUrl) return fromUrl[1]!;
  return trimmed;
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/,/g, '').replace(/%$/, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

const ID_HEADERS = new Set(['id', 'tweet_id', 'tweetid', 'id_str', 'post_id']);
const PERMALINK_HEADERS = new Set(['permalink', 'tweet_permalink', 'url', 'tweet_url']);
const IMPRESSION_HEADERS = new Set(['impressions', 'impression_count', 'views', 'view_count']);
const LIKE_HEADERS = new Set(['likes', 'like_count', 'favorite_count', 'favourites']);
const REPOST_HEADERS = new Set(['reposts', 'retweets', 'retweet_count', 'repost_count']);
const REPLY_HEADERS = new Set(['replies', 'reply_count']);
const BOOKMARK_HEADERS = new Set(['bookmarks', 'bookmark_count']);
const QUOTE_HEADERS = new Set(['quotes', 'quote_count']);
const TEXT_HEADERS = new Set(['text', 'full_text', 'tweet_text', 'tweet']);
const TIME_HEADERS = new Set(['created_at', 'createdat', 'time', 'date', 'posted_at', 'timestamp']);
const MEDIA_HEADERS = new Set(['media', 'media_type', 'mediatype']);
const LANG_HEADERS = new Set(['lang', 'language']);

function pick(row: Record<string, string>, names: Set<string>): string | undefined {
  for (const name of names) {
    const value = row[name];
    if (value != null && value.trim() !== '') return value.trim();
  }
  return undefined;
}

function mediaTypeFromToken(value: string | undefined): HistoryPost['mediaType'] {
  if (!value) return null;
  const token = value.toLowerCase();
  if (token.includes('video')) return 'video';
  if (token.includes('gif')) return 'gif';
  if (token === 'photo' || token === 'image' || token.includes('photo') || token.includes('image')) return 'image';
  if (token === 'none' || token === 'text') return null;
  return null;
}

function metricFromFields(fields: Record<string, string>): MetricRow | null {
  const explicitId = pick(fields, ID_HEADERS);
  const id = normalizeId(explicitId ?? pick(fields, PERMALINK_HEADERS) ?? '');
  const impressions = parseCount(pick(fields, IMPRESSION_HEADERS));
  if (!id || impressions == null) return null;
  const text = pick(fields, TEXT_HEADERS);
  const createdRaw = pick(fields, TIME_HEADERS);
  let createdAt: string | undefined;
  if (createdRaw) {
    const parsed = Date.parse(createdRaw);
    if (!Number.isNaN(parsed)) createdAt = new Date(parsed).toISOString();
  }
  return {
    id,
    impressions,
    likes: parseCount(pick(fields, LIKE_HEADERS)) ?? 0,
    retweets: parseCount(pick(fields, REPOST_HEADERS)) ?? 0,
    replies: parseCount(pick(fields, REPLY_HEADERS)) ?? 0,
    quotes: parseCount(pick(fields, QUOTE_HEADERS)) ?? 0,
    bookmarks: parseCount(pick(fields, BOOKMARK_HEADERS)) ?? 0,
    text,
    createdAt,
    mediaType: mediaTypeFromToken(pick(fields, MEDIA_HEADERS)),
    lang: pick(fields, LANG_HEADERS),
  };
}

function rowsFromCsv(text: string): { rows: MetricRow[]; bad: number } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], bad: 0 };
  const headers = table[0]!.map(headerKey);
  const rows: MetricRow[] = [];
  let bad = 0;
  for (const cells of table.slice(1)) {
    const fields: Record<string, string> = {};
    headers.forEach((header, index) => {
      fields[header] = cells[index] ?? '';
    });
    const row = metricFromFields(fields);
    if (row) rows.push(row);
    else bad++;
  }
  return { rows, bad };
}

function rowsFromJsonValue(value: unknown): { rows: MetricRow[]; bad: number } {
  const list = unwrapList(value);
  const rows: MetricRow[] = [];
  let bad = 0;
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) {
      bad++;
      continue;
    }
    const metrics = asRecord(rec.public_metrics);
    const fields: Record<string, string> = {};
    const assign = (key: string, raw: unknown) => {
      if (typeof raw === 'string' || typeof raw === 'number') fields[key] = String(raw);
    };
    assign('id', rec.id_str ?? rec.id ?? rec.tweet_id ?? rec.post_id);
    assign('permalink', rec.permalink ?? rec.url);
    assign('impressions', metrics?.impression_count ?? rec.impressions ?? rec.views);
    assign('likes', metrics?.like_count ?? rec.likes ?? rec.favorite_count);
    assign('retweets', metrics?.retweet_count ?? rec.retweets ?? rec.reposts);
    assign('replies', metrics?.reply_count ?? rec.replies);
    assign('quotes', metrics?.quote_count ?? rec.quotes);
    assign('bookmarks', metrics?.bookmark_count ?? rec.bookmarks);
    assign('text', rec.full_text ?? rec.text ?? rec.tweet_text);
    assign('created_at', rec.created_at ?? rec.createdAt ?? rec.time);
    assign('media', rec.mediaType ?? rec.media_type ?? rec.media);
    assign('lang', rec.lang);
    const row = metricFromFields(fields);
    if (row) rows.push(row);
    else bad++;
  }
  return { rows, bad };
}

function unwrapList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  for (const key of ['metrics', 'posts', 'tweets', 'data']) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return Object.entries(rec).map(([id, item]) => {
    const row = asRecord(item);
    if (!row) return { id };
    if (row.id == null && row.id_str == null && row.tweet_id == null) return { ...row, id };
    return row;
  });
}

export function parseMetricsText(text: string): { rows: MetricRow[]; bad: number } {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { rows: [], bad: 0 };
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Metrics JSON could not be parsed.');
    }
    return rowsFromJsonValue(parsed);
  }
  return rowsFromCsv(trimmed);
}

function unwrapArchive(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) throw new Error('Archive file must be a JSON array of tweets.');
  for (const key of ['tweets', 'tweet', 'data']) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  throw new Error('Archive file must be a JSON array of tweets.');
}

/** Parse `window.YTD.tweets.part0 = [...]` or a raw JSON array. */
export function parseArchiveArray(source: string): unknown[] {
  const trimmed = source.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let body = trimmed;
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    const eq = trimmed.indexOf('=');
    if (eq === -1) throw new Error('Archive file is not tweets.js or a JSON array.');
    body = trimmed.slice(eq + 1).trim();
    if (body.endsWith(';')) body = body.slice(0, -1).trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Archive file could not be parsed as JSON.');
  }
  return unwrapArchive(parsed);
}

function tweetRecord(value: unknown): Record<string, unknown> | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const nested = asRecord(rec.tweet);
  return nested ?? rec;
}

function mediaFromTweet(tweet: Record<string, unknown>): HistoryPost['mediaType'] {
  const extended = asRecord(tweet.extended_entities);
  const entities = asRecord(tweet.entities);
  const lists = [
    ...(Array.isArray(extended?.media) ? extended.media : []),
    ...(Array.isArray(entities?.media) ? entities.media : []),
  ];
  const types = lists.map((item) => String(asRecord(item)?.type ?? ''));
  if (types.some((type) => type.toLowerCase().includes('video'))) return 'video';
  if (types.some((type) => type.toLowerCase().includes('gif'))) return 'gif';
  if (types.some((type) => type.toLowerCase().includes('photo') || type.toLowerCase() === 'image')) return 'image';
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** twitter/x/pic/twimg links and the quoted post's permalink are not external. */
function isNonExternalExpanded(expanded: string, quotedId: string): boolean {
  if (!expanded) return false;
  if (quotedId && expanded.includes(quotedId)) return true;
  const host = hostOf(expanded);
  return (
    host === 'twitter.com' ||
    host === 'mobile.twitter.com' ||
    host === 'x.com' ||
    host === 'pic.twitter.com' ||
    host === 'pic.x.com' ||
    host === 'pbs.twimg.com' ||
    host === 'video.twimg.com'
  );
}

function cleanArchiveText(tweet: Record<string, unknown>, text: string): string {
  const entities = asRecord(tweet.entities);
  const extended = asRecord(tweet.extended_entities);
  const urls = [
    ...(Array.isArray(entities?.urls) ? entities.urls : []),
    ...(Array.isArray(entities?.media) ? entities.media : []),
    ...(Array.isArray(extended?.media) ? extended.media : []),
  ];
  const quotedId = String(tweet.quoted_status_id_str ?? tweet.quoted_status_id ?? '');
  let out = text;
  const remove = (value: string) => {
    if (value) out = out.split(value).join(' ');
  };
  for (const item of urls) {
    const url = asRecord(item);
    if (!url) continue;
    const short = typeof url.url === 'string' ? url.url : '';
    const expanded = typeof url.expanded_url === 'string' ? url.expanded_url : '';
    const display = typeof url.display_url === 'string' ? url.display_url : '';
    const mediaUrl = typeof url.media_url_https === 'string' ? url.media_url_https : typeof url.media_url === 'string' ? url.media_url : '';
    const isMedia =
      Boolean(url.media_key) ||
      url.type != null ||
      display.startsWith('pic.x.com') ||
      display.startsWith('pic.twitter.com') ||
      expanded.includes('/photo/') ||
      expanded.includes('/video/');
    if (isMedia || isNonExternalExpanded(expanded, quotedId)) {
      remove(short);
      remove(expanded);
      remove(mediaUrl);
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function screenName(tweet: Record<string, unknown>): string | null {
  const user = asRecord(tweet.user);
  const name = tweet.screen_name ?? user?.screen_name ?? user?.username;
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().replace(/^@/, '');
  return cleaned.length > 0 ? cleaned : null;
}

function sameHandle(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function toHistory(input: {
  id: string;
  createdAt: string;
  text: string;
  kind: string;
  lang: string;
  mediaType: HistoryPost['mediaType'];
  metric: MetricRow;
  account: string;
  selfReply: boolean;
}): HistoryPost {
  return {
    id: input.id,
    createdAt: input.createdAt,
    text: input.text,
    kind: input.kind,
    lang: input.lang,
    mediaType: input.mediaType,
    impressions: input.metric.impressions,
    likes: input.metric.likes,
    retweets: input.metric.retweets,
    replies: input.metric.replies,
    quotes: input.metric.quotes,
    bookmarks: input.metric.bookmarks,
    followerCount: null,
    account: input.account,
    authorId: input.selfReply ? 'self' : null,
    selfReply: input.selfReply,
  };
}

function pushKept(
  posts: HistoryPost[],
  stats: ImportStats,
  post: HistoryPost,
): void {
  posts.push(post);
  stats.kept++;
}

export function importHistory(input: ImportInput): ImportResult {
  const stats = emptyStats();
  const archiveText = input.archiveText?.trim() ?? '';
  const metricsText = input.metricsText?.trim() ?? '';
  if (!archiveText && !metricsText) {
    throw new Error('Provide an X archive (tweets.js) and a metrics file, or a metrics file that includes text and time.');
  }
  if (archiveText && !metricsText) {
    throw new Error('The X archive does not include impressions. Add a CSV or JSON metrics file.');
  }

  const parsedMetrics = parseMetricsText(metricsText);
  stats.metricRows = parsedMetrics.rows.length;
  stats.badMetricRow = parsedMetrics.bad;
  const metricsById = new Map<string, MetricRow>();
  for (const row of parsedMetrics.rows) metricsById.set(row.id, row);

  let account = input.account?.trim().replace(/^@/, '') ?? '';
  const posts: HistoryPost[] = [];
  const used = new Set<string>();

  if (archiveText) {
    const items = parseArchiveArray(archiveText);
    stats.archiveTweets = items.length;
    if (!account) {
      for (const item of items) {
        const tweet = tweetRecord(item);
        const name = tweet ? screenName(tweet) : null;
        if (name) {
          account = name;
          break;
        }
      }
    }
    if (!account) account = 'account';

    for (const item of items) {
      const tweet = tweetRecord(item);
      if (!tweet) {
        stats.badArchiveRow++;
        continue;
      }
      const id = normalizeId(tweet.id_str ?? tweet.id);
      const createdRaw = typeof tweet.created_at === 'string' ? tweet.created_at : '';
      const createdMs = Date.parse(createdRaw);
      if (!id || Number.isNaN(createdMs)) {
        stats.badArchiveRow++;
        continue;
      }
      const fullText = typeof tweet.full_text === 'string' ? tweet.full_text : typeof tweet.text === 'string' ? tweet.text : '';
      const isRetweet = fullText.startsWith('RT @') || tweet.retweeted_status != null;
      if (isRetweet) {
        stats.droppedRetweet++;
        used.add(id);
        continue;
      }
      const replyToStatus = tweet.in_reply_to_status_id_str ?? tweet.in_reply_to_status_id;
      const replyToScreen = typeof tweet.in_reply_to_screen_name === 'string' ? tweet.in_reply_to_screen_name : null;
      const isReply = replyToStatus != null && String(replyToStatus).length > 0;
      const isSelf = isReply && sameHandle(replyToScreen, account);
      if (isReply && !isSelf) {
        stats.droppedReply++;
        used.add(id);
        continue;
      }
      const metric = metricsById.get(id);
      if (!metric) {
        stats.missingMetrics++;
        continue;
      }
      used.add(id);
      const text = cleanArchiveText(tweet, fullText);
      const mediaType = mediaFromTweet(tweet) ?? metric.mediaType ?? null;
      if (text.length < 1 && !mediaType) {
        stats.empty++;
        continue;
      }
      const isQuote = tweet.is_quote_status === true || tweet.quoted_status_id_str != null || tweet.quoted_status_id != null;
      const kind = isSelf ? 'reply' : isQuote ? 'quote' : 'original';
      const lang = typeof tweet.lang === 'string' ? tweet.lang : metric.lang ?? 'und';
      pushKept(
        posts,
        stats,
        toHistory({
          id,
          createdAt: new Date(createdMs).toISOString(),
          text,
          kind,
          lang,
          mediaType,
          metric,
          account,
          selfReply: isSelf,
        }),
      );
    }
  }

  if (!account) account = 'account';

  for (const row of parsedMetrics.rows) {
    if (used.has(row.id)) continue;
    if (archiveText) {
      stats.unmatchedMetrics++;
      continue;
    }
    if (!row.text || !row.createdAt) {
      stats.badMetricRow++;
      continue;
    }
    const text = row.text.trim();
    if (text.length < 1 && !row.mediaType) {
      stats.empty++;
      continue;
    }
    if (text.startsWith('RT @')) {
      stats.droppedRetweet++;
      continue;
    }
    pushKept(
      posts,
      stats,
      toHistory({
        id: row.id,
        createdAt: row.createdAt,
        text,
        kind: 'original',
        lang: row.lang ?? 'und',
        mediaType: row.mediaType ?? null,
        metric: row,
        account,
        selfReply: false,
      }),
    );
  }

  posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  return { posts, stats, account };
}

/** Shape `parsePostsJson` accepts, so a training file round-trips. */
export function historyToJson(posts: HistoryPost[]): unknown[] {
  return posts.map((post) => ({
    id: post.id,
    created_at: post.createdAt,
    text: post.text,
    kind: post.kind,
    lang: post.lang,
    mediaType: post.mediaType,
    impressions: post.impressions,
    likes: post.likes,
    retweets: post.retweets,
    replies: post.replies,
    quotes: post.quotes,
    bookmarks: post.bookmarks,
    account: post.account ?? null,
    author_id: post.selfReply ? post.authorId ?? 'self' : post.authorId ?? null,
    in_reply_to_user_id: post.selfReply ? post.authorId ?? 'self' : null,
  }));
}
