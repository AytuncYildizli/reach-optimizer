import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { AIAnalyzer } from '@reach/ai-checks';

// Force Node.js runtime (Anthropic SDK needs net/tls)
export const runtime = 'nodejs';
export const maxDuration = 30;
import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

/**
 * Generate a self-reply for the user to post immediately after their tweet.
 * Self-replies kickstart conversation threads (150x algorithm boost).
 */
async function generateSelfReply(apiKey: string, tweetContent: string): Promise<string[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0.7,
      system: 'You write self-replies for X/Twitter. A self-reply is the FIRST reply the author posts under their own tweet. It must be directly related to the tweet content. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Write 1 self-reply for this tweet. STRICT RULES:

1. The reply MUST be about the SAME TOPIC as the original tweet — not a vague question
2. Add ONE specific detail, hot take, or follow-up thought about the topic
3. Ask a SPECIFIC question related to the content (not generic like "what do you think?")
4. Under 200 characters
5. No emoji unless the original has them
6. Sound like a real person continuing their thought, not a bot

BAD example (generic): "What made it special for you?"
GOOD example for a tech tweet: "The craziest part? The baseline config outperformed 90% of hand-tuned setups. Has anyone else seen this?"
GOOD example for a news tweet: "Turkey's been doing this for 3 years. Nobody reported it."

Original tweet: "${tweetContent}"

Return JSON: {"suggestions": ["self-reply"]}`,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text ?? '{}';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const result = JSON.parse(cleaned);
  return result.suggestions || [];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // Parse body first
  const body: SuggestRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  // Try auth (optional in beta)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  // Rate limit by userId or IP
  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI features not configured', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
      { status: 503 }
    );
  }

  try {
    if (body.type === 'self-reply') {
      // Generate a self-reply that adds value and starts a conversation
      const suggestions = await generateSelfReply(env.ANTHROPIC_API_KEY, body.content);
      return NextResponse.json({ success: true, suggestions });
    }

    const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
    const suggestions = await analyzer.generateHookSuggestions(body.content);

    return NextResponse.json({ success: true, suggestions, debug: { count: suggestions.length, apiKeyPrefix: env.ANTHROPIC_API_KEY.substring(0, 10) + '...' } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'AI generation failed: ' + (error instanceof Error ? error.message : String(error)), code: 'INTERNAL_ERROR' } as ErrorResponse,
      { status: 500 }
    );
  }
}
