import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { prisma } from '@lib/db';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Try auth (optional in beta)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  try {
    const where = userId ? { userId } : {};
    const tweets = await prisma.trackedTweet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: userId ? 50 : 10,
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
