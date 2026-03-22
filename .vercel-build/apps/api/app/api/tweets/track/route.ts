import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // 1. Parse and validate body
  let body: { tweetUrl?: string; content?: string; reachScore?: number; optimized?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  if (!body.tweetUrl || typeof body.tweetUrl !== 'string') {
    return NextResponse.json(
      { success: false, error: 'tweetUrl is required', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'content is required', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }
  if (body.reachScore == null || typeof body.reachScore !== 'number') {
    return NextResponse.json(
      { success: false, error: 'reachScore is required and must be a number', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  // 2. Try auth (optional in beta)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  // 3. Rate limit by userId or IP
  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  // 4. Extract x_tweet_id from URL
  const tweetIdMatch = body.tweetUrl.match(/status\/(\d+)/);
  const xTweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  // 5. Save to DB
  try {
    const tracked = await prisma.trackedTweet.create({
      data: {
        userId,
        tweetUrl: body.tweetUrl,
        xTweetId,
        content: body.content,
        reachScore: body.reachScore,
        optimized: body.optimized ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: tracked.id,
        tweetUrl: tracked.tweetUrl,
        reachScore: tracked.reachScore,
      },
    });
  } catch (error) {
    console.error('[Track] DB save failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save tracked tweet', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
