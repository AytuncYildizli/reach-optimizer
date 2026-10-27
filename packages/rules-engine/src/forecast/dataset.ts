import { median } from './stats';
import {
  buildFeatureRecord,
  legacyHeuristicImpressions,
  scorePost,
  topicTokens,
} from './features';

export interface HistoryPost {
  id: string;
  createdAt: string;
  /** Text with media and quote-permalink URLs removed. Content links stay. */
  text: string;
  kind: string;
  lang: string;
  mediaType: 'image' | 'video' | 'gif' | null;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  /** Follower count dated to this post. A constant value is dropped at fit time. */
  followerCount: number | null;
  /** Handle when the file labels accounts. Filename stem is applied by the CLI. */
  account?: string | null;
  authorId?: string | null;
  quoted?: QuotedContext | null;
}

export interface QuotedContext {
  impressions: number | null;
  authorFollowers: number | null;
  ageHours: number | null;
  selfQuote: boolean;
  /** True when a finite quoted impression count was present, including zero. */
  metricsPresent: boolean;
}

export interface ModelRow {
  id: string;
  createdAt: string;
  features: Record<string, number>;
  impressions: number;
  engagement: number;
  baselineImpressions: number;
  baselineEngagement: number;
  checklistScore: number;
  heuristicImpressions: number;
  automatedSpam: boolean;
  text: string;
  hasImage: boolean;
  hasVideo: boolean;
  isQuote: boolean;
  lang: string;
  account: string;
}

export interface PrepareOptions {
  timezone: string;
  asOf: Date;
  minAgeDays: number;
  window: number;
  minHistory: number;
  /**
   * Add `q_rel_imp` = log(quoted impressions + 1) − log(baseline).
   * Off by default. That count is taken at fetch time, after the quote, so the
   * quote has already sent viewers to the quoted post. Live scoring must read
   * it at compose time. The other quote features stay on: they are known then.
   */
  quotedImpressions?: boolean;
}

export interface PreparedDataset {
  rows: ModelRow[];
  eligible: HistoryPost[];
  dropped: Record<string, number>;
  /** Checklist scores for every eligible post, including the warmup prefix. */
  checklist: Array<{ impressions: number; engagement: number; score: number; automatedSpam: boolean }>;
  /** Context a brand-new post would see, from the tail of `eligible`. */
  nextContext: {
    baselineImpressions: number | null;
    baselineEngagement: number | null;
    latestPostAt: string | null;
    recentPostAts: string[];
    recentTopics: string[];
  };
}

export function engagementRate(post: Pick<HistoryPost, 'likes' | 'retweets' | 'replies' | 'quotes' | 'impressions'>): number {
  if (!(post.impressions > 0)) return 0;
  return (post.likes + post.retweets + post.replies + post.quotes) / post.impressions;
}

function num(value: unknown): number {
  const n = optionalNum(value);
  return n == null ? 0 : n;
}

function optionalNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function attachmentUrls(raw: Record<string, unknown>): string[] {
  const entities = asRecord(raw.entities);
  const urls = Array.isArray(entities?.urls) ? entities.urls : [];
  const refs = Array.isArray(raw.referenced_tweets) ? raw.referenced_tweets : [];
  const quotedIds = refs
    .map((r) => asRecord(r))
    .filter((r): r is Record<string, unknown> => !!r && r.type === 'quoted')
    .map((r) => String(r.id));
  const out: string[] = [];
  for (const item of urls) {
    const u = asRecord(item);
    if (!u || typeof u.url !== 'string') continue;
    const display = typeof u.display_url === 'string' ? u.display_url : '';
    const expanded = typeof u.expanded_url === 'string' ? u.expanded_url : '';
    const isMedia = Boolean(u.media_key) || display.startsWith('pic.x.com') || expanded.includes('/photo/');
    const isQuotePermalink = quotedIds.some((id) => expanded.includes(id));
    if (isMedia || isQuotePermalink) out.push(u.url);
  }
  return out;
}

function cleanScoreText(text: string, urls: string[]): string {
  let out = text;
  for (const url of urls) out = out.split(url).join(' ');
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function mapMedia(types: string[]): HistoryPost['mediaType'] {
  const s = types.map((t) => t.toLowerCase());
  if (s.some((t) => t.includes('video'))) return 'video';
  if (s.some((t) => t.includes('gif'))) return 'gif';
  if (s.some((t) => t === 'photo' || t === 'image')) return 'image';
  return null;
}

function kindOf(raw: Record<string, unknown>): string {
  if (typeof raw.kind === 'string') return raw.kind;
  const refs = Array.isArray(raw.referenced_tweets) ? raw.referenced_tweets : [];
  const types = refs.map((r) => asRecord(r)?.type);
  if (types.includes('replied_to')) return 'reply';
  if (types.includes('quoted')) return 'quote';
  return 'original';
}

function accountOf(raw: Record<string, unknown>): string | null {
  const value = raw.account ?? raw.username ?? raw.author_username ?? raw.screen_name;
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/^@/, '');
  return name.length > 0 ? name : null;
}

function followerCountOf(raw: Record<string, unknown>, createdAt: string): number | null {
  const snaps = raw.follower_snapshots ?? raw.followerSnapshots;
  if (Array.isArray(snaps)) {
    const created = Date.parse(createdAt);
    let best: { at: number; count: number } | null = null;
    for (const item of snaps) {
      const rec = asRecord(item);
      if (!rec) continue;
      const at = Date.parse(String(rec.at ?? rec.date ?? rec.created_at ?? ''));
      const count = optionalNum(rec.followers ?? rec.follower_count ?? rec.followerCount ?? rec.count);
      if (Number.isNaN(at) || count == null || at > created) continue;
      if (!best || at >= best.at) best = { at, count };
    }
    if (best) return best.count;
  }
  const author = asRecord(raw.author);
  const authorMetrics = author ? asRecord(author.public_metrics) : null;
  return optionalNum(
    raw.follower_count ??
      raw.followerCount ??
      raw.followers ??
      raw.followers_count ??
      authorMetrics?.followers_count,
  );
}

function parseQuoted(raw: Record<string, unknown>, authorId: string | null, createdAt: string): QuotedContext | null {
  const quoted = asRecord(raw.quoted);
  const metrics = quoted ? asRecord(quoted.public_metrics) : null;
  const impressions = optionalNum(metrics?.impression_count ?? raw.quoted_impressions);
  const authorFollowers = optionalNum(quoted?.author_followers ?? raw.quoted_author_followers);
  let ageHours = optionalNum(raw.quoted_post_age_at_quote_h);
  if (ageHours == null && quoted && typeof quoted.created_at === 'string') {
    const delta = Date.parse(createdAt) - Date.parse(quoted.created_at);
    if (!Number.isNaN(delta)) ageHours = Math.max(0, delta / 36e5);
  }
  const quotedAuthor = quoted?.author_id != null ? String(quoted.author_id) : null;
  const selfQuote =
    typeof quoted?.is_self_quote === 'boolean'
      ? quoted.is_self_quote
      : !!(authorId && quotedAuthor && authorId === quotedAuthor);
  if (!quoted && impressions == null && authorFollowers == null && ageHours == null) return null;
  return {
    impressions,
    authorFollowers,
    ageHours,
    selfQuote,
    metricsPresent: impressions != null,
  };
}

function parseOne(value: unknown, fallbackAccount?: string): HistoryPost | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = raw.id != null ? String(raw.id) : '';
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : typeof raw.createdAt === 'string' ? raw.createdAt : '';
  if (!id || !createdAt || Number.isNaN(Date.parse(createdAt))) return null;

  const metrics = asRecord(raw.public_metrics);
  const impressions = metrics ? num(metrics.impression_count) : num(raw.impressions ?? raw.views);
  const likes = metrics ? num(metrics.like_count) : num(raw.likes);
  const retweets = metrics ? num(metrics.retweet_count) : num(raw.retweets);
  const replies = metrics ? num(metrics.reply_count) : num(raw.replies);
  const quotes = metrics ? num(metrics.quote_count) : num(raw.quotes);
  const bookmarks = metrics ? num(metrics.bookmark_count) : num(raw.bookmarks);

  const textRaw = typeof raw.full_text === 'string' ? raw.full_text : typeof raw.text === 'string' ? raw.text : '';
  const text = cleanScoreText(textRaw, attachmentUrls(raw));

  let mediaType: HistoryPost['mediaType'] = null;
  if (Array.isArray(raw.media_types)) mediaType = mapMedia(raw.media_types.map(String));
  else if (raw.mediaType === 'image' || raw.mediaType === 'video' || raw.mediaType === 'gif') mediaType = raw.mediaType;
  else if (typeof raw.media === 'string' && raw.media !== 'none') mediaType = mapMedia([raw.media]);

  const authorId = raw.author_id != null ? String(raw.author_id) : raw.authorId != null ? String(raw.authorId) : null;

  return {
    id,
    createdAt,
    text,
    kind: kindOf(raw),
    lang: typeof raw.lang === 'string' ? raw.lang : 'und',
    mediaType,
    impressions,
    likes,
    retweets,
    replies,
    quotes,
    bookmarks,
    followerCount: followerCountOf(raw, createdAt),
    account: accountOf(raw) ?? fallbackAccount ?? null,
    authorId,
    quoted: parseQuoted(raw, authorId, createdAt),
  };
}

export function parsePostsJson(data: unknown, fallbackAccount?: string): HistoryPost[] {
  if (!Array.isArray(data)) throw new Error('Posts file must be a JSON array');
  const posts: HistoryPost[] = [];
  for (const item of data) {
    const post = parseOne(item, fallbackAccount);
    if (post) posts.push(post);
  }
  return posts;
}

export function postsByAccount(
  posts: HistoryPost[],
  fallback = 'account',
): Array<{ account: string; posts: HistoryPost[] }> {
  const map = new Map<string, HistoryPost[]>();
  for (const post of posts) {
    const account = post.account?.trim() || fallback;
    const list = map.get(account) ?? [];
    list.push(post);
    map.set(account, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, grouped]) => ({ account, posts: grouped }));
}

function dedupeKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mediaFlags(mediaType: HistoryPost['mediaType']): { hasImage: boolean; hasVideo: boolean } {
  return {
    hasImage: mediaType === 'image' || mediaType === 'gif',
    hasVideo: mediaType === 'video',
  };
}

export function prepareDataset(posts: HistoryPost[], opts: PrepareOptions): PreparedDataset {
  const dropped: Record<string, number> = {
    reply: 0,
    short_text: 0,
    too_recent: 0,
    non_positive_impressions: 0,
    duplicate: 0,
    bad_timestamp: 0,
  };
  const cutoff = opts.asOf.getTime() - opts.minAgeDays * 24 * 60 * 60 * 1000;
  const candidates: HistoryPost[] = [];
  // Recency and topic context include posts that are too young to be targets.
  // Their impressions are still moving, so they stay out of the rolling baseline.
  const activity: HistoryPost[] = [];

  for (const post of posts) {
    if (post.kind === 'reply') {
      dropped.reply = (dropped.reply ?? 0) + 1;
      continue;
    }
    const created = Date.parse(post.createdAt);
    if (Number.isNaN(created)) {
      dropped.bad_timestamp = (dropped.bad_timestamp ?? 0) + 1;
      continue;
    }
    if (post.text.trim().length < 3) {
      dropped.short_text = (dropped.short_text ?? 0) + 1;
      continue;
    }
    if (created > opts.asOf.getTime()) {
      dropped.too_recent = (dropped.too_recent ?? 0) + 1;
      continue;
    }
    const mature = created < cutoff && post.impressions > 0;
    if (created >= cutoff) dropped.too_recent = (dropped.too_recent ?? 0) + 1;
    else if (!(post.impressions > 0)) dropped.non_positive_impressions = (dropped.non_positive_impressions ?? 0) + 1;
    if (mature) candidates.push(post);
    activity.push(post);
  }

  candidates.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const eligible: HistoryPost[] = [];
  for (const post of candidates) {
    const key = dedupeKey(post.text);
    if (seen.has(key)) {
      dropped.duplicate = (dropped.duplicate ?? 0) + 1;
      continue;
    }
    seen.add(key);
    eligible.push(post);
  }

  const rows: ModelRow[] = [];
  const checklist: PreparedDataset['checklist'] = [];

  for (let i = 0; i < eligible.length; i++) {
    const post = eligible[i]!;
    const prior = eligible.slice(0, i);
    const created = new Date(post.createdAt);
    const postsLast24h = prior.filter((p) => created.getTime() - Date.parse(p.createdAt) <= 24 * 60 * 60 * 1000 && created.getTime() - Date.parse(p.createdAt) >= 0).length;
    const recentTopics = [...new Set(prior.slice(-10).flatMap((p) => topicTokens(p.text)))].slice(0, 40);
    const { hasImage, hasVideo } = mediaFlags(post.mediaType);
    const isQuote = post.kind === 'quote';
    const scored = scorePost({
      text: post.text,
      hasImage,
      hasVideo,
      isQuote,
      postsToday: postsLast24h,
      recentTopics,
    });
    const engagement = engagementRate(post);
    checklist.push({
      impressions: post.impressions,
      engagement,
      score: scored.checklistScore,
      automatedSpam: scored.automatedSpam,
    });

    if (prior.length < opts.minHistory) continue;
    const window = prior.slice(-opts.window);
    const baselineImpressions = median(window.map((p) => p.impressions));
    const baselineEngagement = median(window.map((p) => engagementRate(p)));
    const prev = prior[prior.length - 1]!;
    const hoursSincePrev = (created.getTime() - Date.parse(prev.createdAt)) / 36e5;
    const features = buildFeatureRecord({
      text: post.text,
      signals: scored.signals,
      createdAt: created,
      timeZone: opts.timezone,
      hasImage,
      hasVideo,
      isQuote,
      lang: post.lang,
      hoursSincePrev,
      postsLast24h,
      baselineImpressions,
      baselineEngagement,
      followerCount: post.followerCount,
      quote: post.quoted ?? null,
      quotedImpressions: opts.quotedImpressions ?? false,
    });
    rows.push({
      id: post.id,
      createdAt: post.createdAt,
      features,
      impressions: post.impressions,
      engagement,
      baselineImpressions,
      baselineEngagement,
      checklistScore: scored.checklistScore,
      heuristicImpressions: legacyHeuristicImpressions({
        baseline: baselineImpressions,
        score: scored.checklistScore,
        hasImage,
        hasVideo,
        curiosityGap: scored.curiosityGap,
        text: post.text,
        createdAt: created,
      }),
      automatedSpam: scored.automatedSpam,
      text: post.text,
      hasImage,
      hasVideo,
      isQuote,
      lang: post.lang,
      account: post.account?.trim() || '',
    });
  }

  activity.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const tail = eligible.slice(-opts.window);
  const topicSource = activity.slice(-10);
  const latestActivity = activity[activity.length - 1];
  return {
    rows,
    eligible,
    dropped,
    checklist,
    nextContext: {
      baselineImpressions: tail.length > 0 ? median(tail.map((p) => p.impressions)) : null,
      baselineEngagement: tail.length > 0 ? median(tail.map((p) => engagementRate(p))) : null,
      latestPostAt: latestActivity ? latestActivity.createdAt : null,
      recentPostAts: activity.slice(-40).map((p) => p.createdAt),
      recentTopics: [...new Set(topicSource.flatMap((p) => topicTokens(p.text)))].slice(0, 40),
    },
  };
}
