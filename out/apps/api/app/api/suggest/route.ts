import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { AIAnalyzer } from '@reach/ai-checks';
import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

export async function POST(request: NextRequest) {
  // Auth
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  // Rate limit
  const rateLimited = applyRateLimit(request, auth.userId);
  if (rateLimited) return rateLimited;

  // Parse
  const body: SuggestRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI features not configured', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
      { status: 503 }
    );
  }

  const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
  const suggestions = await analyzer.generateHookSuggestions(body.content);

  return NextResponse.json({ success: true, suggestions } satisfies SuggestResponse);
}
