import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, authenticateRequest } from '@lib/middleware';
import { env } from '@lib/env';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Signed-in users only: this route spends the server's Anthropic key
  // and/or stores user data, so anonymous callers are rejected.
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  const rateLimited = applyRateLimit(request, userId);
  if (rateLimited) return rateLimited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI not configured' },
      { status: 503 },
    );
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        temperature: 0.7,
        system: 'You generate engaging reply templates for X/Twitter. Return ONLY valid JSON.',
        messages: [
          {
            role: 'user',
            content: `Generate 3 short, engaging reply templates that a creator can use to respond to followers' comments on their tweets. These should:
- Be conversational and genuine (not robotic)
- Encourage further discussion (reply-to-reply chains are worth 150x in the algorithm)
- Be under 100 characters each
- Include a question or open-ended element

Context: ${body.context || 'General tweet engagement'}

Return JSON: {"suggestions": ["reply1", "reply2", "reply3"]}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '{}';
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const result = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      suggestions: result.suggestions || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
