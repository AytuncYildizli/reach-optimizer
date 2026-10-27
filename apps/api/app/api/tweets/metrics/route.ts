import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@lib/middleware';
import { prisma } from '@lib/db';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Tracked tweets are per-user data: never return rows without a verified
  // owner (an unfiltered query used to expose every user's tweets).
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const tweets = await prisma.trackedTweet.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        metrics: {
          orderBy: { measuredAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({ success: true, data: tweets });
  } catch (error) {
    console.error('[Metrics] DB query failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch metrics', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
