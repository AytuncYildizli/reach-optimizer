import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for multiple rounds

const engine = new ScoreEngine(allClientRules);

interface OptimizeRound {
  round: number;
  bestText: string;
  bestScore: number;
  delta: number; // vs original
  alternatives: { text: string; score: number }[];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const originalText = body.content as string;
  const maxRounds = Math.min(body.maxRounds || 5, 5);

  if (!originalText || originalText.length < 10) {
    return NextResponse.json({ success: false, error: 'Content too short' }, { status: 400 });
  }

  // Try auth (optional in beta)
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
    return NextResponse.json({ success: false, error: 'AI not configured' }, { status: 503 });
  }

  // Score original
  const originalResult = engine.evaluate({ text: originalText, platform: 'x', isThread: false, hasMedia: false });
  const originalScore = originalResult.reachScore;

  let currentBest = originalText;
  let currentBestScore = originalScore;
  const rounds: OptimizeRound[] = [];
  let totalGenerated = 0;

  for (let round = 1; round <= maxRounds; round++) {
    // Generate 3 variations of current best
    const variations = await generateVariations(env.ANTHROPIC_API_KEY, currentBest, round);
    totalGenerated += variations.length;

    // Score each variation
    const scored = variations.map(text => {
      const result = engine.evaluate({ text, platform: 'x', isThread: false, hasMedia: false });
      return { text, score: result.reachScore };
    });

    // Find the best this round
    const roundBest = scored.reduce((best, v) => v.score > best.score ? v : best, { text: currentBest, score: currentBestScore });

    rounds.push({
      round,
      bestText: roundBest.text,
      bestScore: roundBest.score,
      delta: roundBest.score - originalScore,
      alternatives: scored.sort((a, b) => b.score - a.score),
    });

    // Stop conditions
    if (roundBest.score >= 85) break; // Perfect tier
    if (roundBest.score <= currentBestScore && round > 1) break; // Plateau

    // Update best for next round
    if (roundBest.score > currentBestScore) {
      currentBest = roundBest.text;
      currentBestScore = roundBest.score;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      originalScore,
      finalScore: currentBestScore,
      improvement: currentBestScore - originalScore,
      rounds,
      totalGenerated,
      bestText: currentBest,
    }
  });
}

async function generateVariations(apiKey: string, seedText: string, round: number): Promise<string[]> {
  const strategies = round === 1
    ? 'Version 1: Bold/contrarian opener. Version 2: Specific number/data lead. Version 3: Provocative question that the tweet answers.'
    : 'Push harder. Make the hook more specific, the claim bolder, the question sharper. Each version should try a DIFFERENT angle than the seed.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.8 + (round * 0.05), // Slightly more creative each round
      system: `You are an elite X/Twitter ghostwriter. You rewrite tweets to maximize reach.

WINNING PROFILE (from 200-experiment autoresearch optimization):
- Tone: provocative and bold (0.77), NOT casual
- Structure: personal story angle (0.85), first-person when possible
- Hook: strong pattern interrupt or bold claim (0.81)
- Specificity: very high — use concrete numbers, names, data (0.92)
- Length: ~2 sentences, around 250-280 characters
- Ending: question or provocative statement (~46% end with question)
- Style: NO emoji, NO hashtags, sound human not AI

Keep EXACT same facts. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Round ${round}. Rewrite this tweet 3 ways. ABSOLUTE RULES:

1. PRESERVE the original message, analogies, metaphors, and framing — these ARE the content
2. Do NOT invent new facts, numbers, or claims that aren't in the original
3. Do NOT replace the original's metaphor with a different one
4. If the original uses an analogy (like comparing X to Y), KEEP that analogy
5. Only change: word order, sentence structure, hook placement, ending
6. Each rewrite under 280 chars, 2 sentences max
7. End ~half with question, ~half with bold statement
8. NO emoji, NO hashtags, NO AI words
${strategies}

Original tweet: "${seedText.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["v1", "v2", "v3"]}`
      }],
    }),
  });

  if (!response.ok) return [];

  try {
    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);
    return (result.suggestions || []).filter((s: string) => s && s.length > 10 && s.length <= 280);
  } catch {
    return [];
  }
}
