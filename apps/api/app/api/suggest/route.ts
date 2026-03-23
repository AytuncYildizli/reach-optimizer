import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { detectLanguage, getLanguageInstruction } from '@reach/ai-checks';

// Force Node.js runtime (Anthropic SDK needs net/tls)
export const runtime = 'nodejs';
export const maxDuration = 30;
import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

/**
 * Generate a self-reply for the user to post immediately after their tweet.
 * Self-replies kickstart conversation threads (150x algorithm boost).
 */
async function generateSelfReply(apiKey: string, tweetContent: string): Promise<string[]> {
  const lang = detectLanguage(tweetContent);
  const langInstruction = getLanguageInstruction(lang);

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
      temperature: 0.5,
      system: `You write self-replies for X/Twitter. A self-reply is the FIRST reply the author posts under their own tweet. It MUST be directly related to the tweet content and in the SAME LANGUAGE.

${langInstruction}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write 1 self-reply for this tweet. STRICT RULES:

1. SAME LANGUAGE as the original tweet — ${lang === 'tr' ? 'write in Turkish' : 'write in English'}
2. The reply MUST reference a SPECIFIC concept, term, or claim from the original tweet
3. Add ONE specific detail: a concrete follow-up fact, a surprising angle, or a pointed question about something mentioned in the tweet
4. The reply must make ZERO sense without reading the original tweet — that's how specific it should be
5. NEVER ask generic questions like "What do you think?" or "Anyone else experienced this?"
6. Under 200 characters
7. No emoji unless the original has them
8. Sound like a real person continuing their thought

EXTRACT the main topic/claim from this tweet, then write a follow-up that ONLY makes sense in that context:

Original tweet: "${tweetContent.replace(/"/g, '\\"')}"

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

/**
 * Generate hook rewrite suggestions — inlined in route for reliable language detection.
 */
async function generateHookSuggestions(apiKey: string, tweetContent: string): Promise<string[]> {
  const lang = detectLanguage(tweetContent);
  const langInstruction = getLanguageInstruction(lang);

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
      temperature: 0.3,
      system: `You are an elite X/Twitter ghostwriter. You REARRANGE tweets to maximize reach. You NEVER add new information.

${langInstruction}

WINNING PROFILE (from 200-experiment autoresearch):
- Tone: provocative and bold (0.77), NOT casual
- Structure: personal story angle (0.85), first-person when possible
- Hook: strong pattern interrupt or bold claim (0.81)
- Specificity: very high — concrete numbers/names/data (0.92)
- Length: ~2 sentences, ~250-280 characters
- Ending: question or provocative statement (~46% end with question)
- Style: NO emoji, NO hashtags, sound human not AI

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Rewrite this tweet 3 ways. ABSOLUTE RULES:

1. Write in ${lang === 'tr' ? 'TURKISH' : 'ENGLISH'} — SAME LANGUAGE as the original
2. PRESERVE the original message, analogies, metaphors, and framing
3. NEVER invent new facts, numbers, statistics, or claims not in the original
4. If the original has NO numbers/statistics, do NOT add any
5. NEVER replace the original's metaphor/analogy with a different one
6. Only change: word order, sentence structure, hook placement, ending style
7. Each rewrite under 280 chars, 2 sentences max
8. End ~half with sharp question, ~half with bold statement
9. NO emoji, NO hashtags, NO AI words (delve, landscape, leverage, unleash, paradigm)

V1: Reorder to lead with the strongest claim
V2: Flip to start with a question the tweet answers
V3: Make the hook more provocative while keeping the same framing

Original tweet:
"${tweetContent.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["v1", "v2", "v3"]}`,
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
      const suggestions = await generateSelfReply(env.ANTHROPIC_API_KEY, body.content);
      return NextResponse.json({ success: true, suggestions });
    }

    // Hook suggestions — inline to bypass turbo cache issues with ai-checks package
    const suggestions = await generateHookSuggestions(env.ANTHROPIC_API_KEY, body.content);
    return NextResponse.json({ success: true, suggestions, debug: { count: suggestions.length } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'AI generation failed: ' + (error instanceof Error ? error.message : String(error)), code: 'INTERNAL_ERROR' } as ErrorResponse,
      { status: 500 }
    );
  }
}
