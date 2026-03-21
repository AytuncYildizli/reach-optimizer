import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { AIAnalyzer } from '@reach/ai-checks';
import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

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

  const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
  const suggestions = await analyzer.generateHookSuggestions(body.content);

  return NextResponse.json({ success: true, suggestions } satisfies SuggestResponse);
}
