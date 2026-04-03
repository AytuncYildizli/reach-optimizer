import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';
import { env } from '@lib/env';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Try auth (optional)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  // Rate limit
  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI features not configured', code: 'INTERNAL_ERROR' },
      { status: 503 },
    );
  }

  // Fetch user's past high-scoring tweets for context
  let topTweets: { content: string; reachScore: number }[] = [];
  if (userId) {
    topTweets = await prisma.trackedTweet.findMany({
      where: { userId },
      orderBy: { reachScore: 'desc' },
      take: 5,
      select: { content: true, reachScore: true },
    });
  }

  const topTweetsContext =
    topTweets.length > 0
      ? topTweets.map((t, i) => `${i + 1}. (Score: ${t.reachScore}) ${t.content}`).join('\n')
      : 'No previous tweets available.';

  const userPrompt = `You are a Twitter/X viral content strategist. Generate 3-5 tweet suggestions optimized for maximum reach and engagement.

${topTweets.length > 0 ? `Here are the user's top-performing tweets for reference:\n${topTweetsContext}\n\nGenerate new tweets that match this user's style and voice but explore fresh angles.` : 'Generate broadly appealing tweet suggestions using proven viral patterns.'}

Rules for high-reach tweets:
- Strong hooks in the first line
- Use power words and curiosity gaps
- Keep under 280 characters
- Avoid AI slop (no "game-changer", "dive into", "here's the thing")
- Include a clear call-to-action or engagement trigger

Return ONLY a JSON array with this exact format, no other text:
[{"text": "tweet text here", "predictedScore": 85, "topic": "topic category"}]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.7,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '';

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = raw.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const suggestions = JSON.parse(jsonStr);

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    console.error('[Suggestions] AI generation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate suggestions: ' + (error instanceof Error ? error.message : String(error)),
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}
