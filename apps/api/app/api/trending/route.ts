import { NextRequest, NextResponse } from 'next/server';
import { getCachedTrends } from '@lib/trending';
import type { TrendingResponse, ErrorResponse } from '@reach/shared-types';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const woeidParam = request.nextUrl.searchParams.get('woeid');
  const woeid = woeidParam ? parseInt(woeidParam, 10) : 1;
  if (isNaN(woeid) || woeid <= 0) {
    return NextResponse.json({ success: false, error: 'Invalid woeid', code: 'VALIDATION_ERROR' } satisfies ErrorResponse, { status: 400 });
  }
  try {
    const cached = await getCachedTrends(woeid);
    const cacheAgeMs = Date.now() - cached.fetchedAt.getTime();
    const cacheExpiresIn = Math.max(0, Math.round((15 * 60 * 1000 - cacheAgeMs) / 1000));
    return NextResponse.json({ success: true, data: { trends: cached.trends, fetchedAt: cached.fetchedAt.toISOString(), woeid: cached.woeid, cacheExpiresIn } } as TrendingResponse, { headers: { 'Cache-Control': `public, max-age=${cacheExpiresIn}` } });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch trends', code: 'INTERNAL_ERROR' } satisfies ErrorResponse, { status: 500 });
  }
}
