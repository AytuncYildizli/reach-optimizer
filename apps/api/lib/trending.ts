import { env } from './env';
import type { TrendingTopic, TrendingAlignment } from '@reach/shared-types';

const CACHE_TTL_MS = 15 * 60 * 1000;
const TRENDING_BONUS_POINTS = 5;

interface TrendingCache {
  trends: TrendingTopic[];
  fetchedAt: Date;
  woeid: number;
}

interface ProviderTrend {
  name: string;
  rank?: number;
  tweet_volume?: number | null;
}

const trendingCaches = new Map<number, TrendingCache>();

function normalizeTrend(
  trend: ProviderTrend,
  index: number,
): TrendingTopic {
  return {
    name: trend.name,
    keyword: trend.name.replace(/^#/, '').toLowerCase(),
    rank: trend.rank ?? index + 1,
    tweetVolume: trend.tweet_volume ?? null,
  };
}

async function fetchTrendsFromTwitterApiIo(woeid = 1): Promise<TrendingTopic[]> {
  const apiKey = env.TWITTER_API_IO_KEY;
  if (!apiKey) return [];
  const url = new URL('https://api.twitterapi.io/twitter/trends');
  url.searchParams.set('woeid', String(woeid));
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'X-API-Key': apiKey } });
  if (!response.ok) throw new Error(`twitterapi.io trends ${response.status}`);
  const data = await response.json();
  const rawTrends: ProviderTrend[] = data.trends ?? data.data?.trends ?? [];
  return rawTrends.map(normalizeTrend);
}

async function fetchTrendsFromXquik(woeid = 1): Promise<TrendingTopic[]> {
  const apiKey = env.XQUIK_API_KEY;
  if (!apiKey) return [];
  const url = new URL(`${env.XQUIK_API_BASE.replace(/\/$/, '')}/trends`);
  url.searchParams.set('woeid', String(woeid));
  url.searchParams.set('count', '30');
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'X-API-Key': apiKey } });
  if (!response.ok) throw new Error(`Xquik trends ${response.status}`);
  const data = await response.json();
  const rawTrends: ProviderTrend[] = data.trends ?? [];
  return rawTrends.map(normalizeTrend);
}

async function fetchTrends(woeid = 1): Promise<TrendingTopic[]> {
  const provider = env.TWITTER_TRENDS_PROVIDER.trim().toLowerCase().replace('-', '_');
  if (provider === 'xquik') {
    return fetchTrendsFromXquik(woeid);
  }

  return fetchTrendsFromTwitterApiIo(woeid);
}

export async function getCachedTrends(woeid = 1): Promise<TrendingCache> {
  const now = Date.now();
  const cached = trendingCaches.get(woeid);
  if (cached && (now - cached.fetchedAt.getTime()) < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const trends = await fetchTrends(woeid);
    const refreshed = { trends, fetchedAt: new Date(), woeid };
    trendingCaches.set(woeid, refreshed);
    return refreshed;
  } catch (error) {
    console.error('[Trending] Fetch failed:', error);
    if (cached) return cached;
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
