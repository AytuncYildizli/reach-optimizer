import { env } from './env';
import type { TrendingTopic, TrendingAlignment } from '@reach/shared-types';

const CACHE_TTL_MS = 15 * 60 * 1000;
const TRENDING_BONUS_POINTS = 5;

interface TrendingCache {
  trends: TrendingTopic[];
  fetchedAt: Date;
  woeid: number;
}

let trendingCache: TrendingCache | null = null;

async function fetchTrendsFromTwitterApi(woeid = 1): Promise<TrendingTopic[]> {
  const apiKey = env.TWITTER_API_IO_KEY;
  if (!apiKey) return [];
  const url = new URL('https://api.twitterapi.io/twitter/trends');
  url.searchParams.set('woeid', String(woeid));
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'X-API-Key': apiKey } });
  if (!response.ok) throw new Error(`twitterapi.io trends ${response.status}`);
  const data = await response.json();
  const rawTrends: Array<{ name: string; query?: string; rank?: number; tweet_volume?: number | null }> = data.trends ?? data.data?.trends ?? [];
  return rawTrends.map((t, i) => ({ name: t.name, keyword: t.name.replace(/^#/, '').toLowerCase(), rank: t.rank ?? i + 1, tweetVolume: t.tweet_volume ?? null }));
}

export async function getCachedTrends(woeid = 1): Promise<TrendingCache> {
  const now = Date.now();
  if (trendingCache && (now - trendingCache.fetchedAt.getTime()) < CACHE_TTL_MS) return trendingCache;
  try {
    const trends = await fetchTrendsFromTwitterApi(woeid);
    trendingCache = { trends, fetchedAt: new Date(), woeid };
    return trendingCache;
  } catch (error) {
    console.error('[Trending] Fetch failed:', error);
    if (trendingCache) return trendingCache;
    return { trends: [], fetchedAt: new Date(), woeid };
  }
}

function hasWordMatch(text: string, keyword: string): boolean {
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;
  const before = idx > 0 ? text[idx - 1] : ' ';
  const after = idx + keyword.length < text.length ? text[idx + keyword.length] : ' ';
  return /[\s,.!?;:'"()\-\/\n\r#@]/.test(before) && /[\s,.!?;:'"()\-\/\n\r#@]/.test(after);
}

export function checkTrendingAlignment(text: string, trends: TrendingTopic[]): TrendingAlignment {
  if (!text || trends.length === 0) return { isAligned: false, matchedTrends: [], bonusPoints: 0 };
  const lowerText = text.toLowerCase();
  const matchedTrends: TrendingTopic[] = [];
  for (const trend of trends) {
    if (trend.keyword.length <= 2) continue;
    if (lowerText.includes(`#${trend.keyword}`) || hasWordMatch(lowerText, trend.keyword)) {
      matchedTrends.push(trend);
    }
  }
  return { isAligned: matchedTrends.length > 0, matchedTrends, bonusPoints: matchedTrends.length > 0 ? TRENDING_BONUS_POINTS : 0 };
}
