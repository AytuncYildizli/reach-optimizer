import { NextRequest, NextResponse } from 'next/server';
import { env } from '@lib/env';
import type { TrendingResponse, ErrorResponse, TrendingTopic, TrendingAlignment } from '@reach/shared-types';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// In-memory cache for trending topics (15-minute TTL)
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface TrendingCache {
  trends: TrendingTopic[];
  fetchedAt: Date;
  woeid: number;
}

let trendingCache: TrendingCache | null = null;

/**
 * Fetch trending topics from twitterapi.io.
 * Uses WOEID 1 (Worldwide) by default.
 */
async function fetchTrendsFromTwitterApi(woeid = 1): Promise<TrendingTopic[]> {
  const apiKey = env.TWITTER_API_IO_KEY;
  if (!apiKey) {
    console.warn('[Trending] TWITTER_API_IO_KEY not set, returning empty trends');
    return [];
  }

  const url = new URL('https://api.twitterapi.io/twitter/trends');
  url.searchParams.set('woeid', String(woeid));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`twitterapi.io trends ${response.status}: ${text}`);
  }

  const data = await response.json();

  // twitterapi.io returns { trends: [{ name, query, rank, meta_description }], status, message }
  const rawTrends: Array<{ name: string; query?: string; rank?: number; meta_description?: string; tweet_volume?: number | null }> =
    data.trends ?? data.data?.trends ?? [];

  return rawTrends.map((t, index) => ({
    name: t.name,
    keyword: t.name.replace(/^#/, '').toLowerCase(),
    rank: t.rank ?? index + 1,
    tweetVolume: t.tweet_volume ?? null,
  }));
}

/**
 * Get trending topics, using cache if fresh enough.
 */
export async function getCachedTrends(woeid = 1): Promise<TrendingCache> {
  const now = Date.now();

  if (trendingCache && (now - trendingCache.fetchedAt.getTime()) < CACHE_TTL_MS) {
    return trendingCache;
  }

  try {
    const trends = await fetchTrendsFromTwitterApi(woeid);
    trendingCache = {
      trends,
      fetchedAt: new Date(),
      woeid,
    };
    console.log(`[Trending] Fetched ${trends.length} trends (woeid=${woeid})`);
    return trendingCache;
  } catch (error) {
    console.error('[Trending] Fetch failed:', error);
    // Return stale cache if available, otherwise empty
    if (trendingCache) {
      console.log('[Trending] Returning stale cache');
      return trendingCache;
    }
    return { trends: [], fetchedAt: new Date(), woeid };
  }
}

// ---------------------------------------------------------------------------
// Trending alignment scoring
// ---------------------------------------------------------------------------

const TRENDING_BONUS_POINTS = 5;

/**
 * Check if tweet text aligns with any trending topics.
 * Uses simple case-insensitive keyword matching.
 */
export function checkTrendingAlignment(
  text: string,
  trends: TrendingTopic[],
): TrendingAlignment {
  if (!text || trends.length === 0) {
    return { isAligned: false, matchedTrends: [], bonusPoints: 0 };
  }

  const lowerText = text.toLowerCase();
  const matchedTrends: TrendingTopic[] = [];

  for (const trend of trends) {
    const keyword = trend.keyword;
    // Skip very short keywords (1-2 chars) to avoid false positives
    if (keyword.length <= 2) continue;

    // Check for keyword match using word boundary logic
    // Look for the keyword as a standalone word or hashtag
    const hashtagMatch = lowerText.includes(`#${keyword}`);
    const wordMatch = hasWordMatch(lowerText, keyword);

    if (hashtagMatch || wordMatch) {
      matchedTrends.push(trend);
    }
  }

  const isAligned = matchedTrends.length > 0;

  return {
    isAligned,
    matchedTrends,
    // Cap at +5 regardless of how many trends match
    bonusPoints: isAligned ? TRENDING_BONUS_POINTS : 0,
  };
}

/**
 * Check if a keyword appears as a whole word in the text.
 * Prevents "cat" from matching "category".
 */
function hasWordMatch(text: string, keyword: string): boolean {
  // For multi-word trends, check if the full phrase appears
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;

  // Check word boundaries
  const charBefore = idx > 0 ? text[idx - 1] : ' ';
  const charAfter = idx + keyword.length < text.length ? text[idx + keyword.length] : ' ';

  const boundaryChars = /[\s,.!?;:'"()\-\/\n\r#@]/;
  return boundaryChars.test(charBefore) && boundaryChars.test(charAfter);
}

// ---------------------------------------------------------------------------
// GET /api/trending
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const woeidParam = request.nextUrl.searchParams.get('woeid');
  const woeid = woeidParam ? parseInt(woeidParam, 10) : 1;

  if (isNaN(woeid) || woeid <= 0) {
    return NextResponse.json(
      { success: false, error: 'Invalid woeid parameter', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  try {
    const cached = await getCachedTrends(woeid);
    const now = Date.now();
    const cacheAgeMs = now - cached.fetchedAt.getTime();
    const cacheExpiresIn = Math.max(0, Math.round((CACHE_TTL_MS - cacheAgeMs) / 1000));

    const response: TrendingResponse = {
      success: true,
      data: {
        trends: cached.trends,
        fetchedAt: cached.fetchedAt.toISOString(),
        woeid: cached.woeid,
        cacheExpiresIn,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheExpiresIn}, s-maxage=${cacheExpiresIn}`,
      },
    });
  } catch (error) {
    console.error('[Trending] Route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch trending topics',
        code: 'INTERNAL_ERROR',
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
