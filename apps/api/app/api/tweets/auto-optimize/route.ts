import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';
import { detectLanguage, getLanguageInstruction } from '@reach/ai-checks';

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
    // Generate 3 variations of current best (pass originalText for language detection)
    const variations = await generateVariations(env.ANTHROPIC_API_KEY, currentBest, round, originalText);
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

async function generateVariations(apiKey: string, seedText: string, round: number, originalText: string): Promise<string[]> {
  const lang = detectLanguage(originalText);
  const langInstruction = getLanguageInstruction(lang);

  const strategies = round === 1
    ? 'Version 1: Reorder to lead with the strongest existing claim. Version 2: Start with a question the tweet answers. Version 3: Make the hook more provocative while keeping the same framing.'
    : 'Rearrange the existing content more aggressively. Try different sentence structures. Each version should try a DIFFERENT arrangement of the SAME content.';

  // Lower temperature to reduce hallucination — 0.4 base, slight increase per round
  const temperature = Math.min(0.4 + (round * 0.05), 0.6);

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
      temperature,
      system: `You are an elite X/Twitter ghostwriter. You REARRANGE tweets to maximize reach. You NEVER add new information.

${langInstruction}

WINNING PROFILE (from 200-experiment autoresearch optimization):
- Tone: provocative and bold (0.77), NOT casual
- Structure: personal story angle (0.85), first-person when possible
- Hook: strong pattern interrupt or bold claim (0.81)
- Length: ~2 sentences, around 250-280 characters
- Ending: question or provocative statement (~46% end with question)
- Style: NO emoji, NO hashtags, sound human not AI

ANTI-HALLUCINATION RULES (CRITICAL):
- If the original has NO numbers, your rewrite must have NO numbers
- If the original has NO statistics/percentages, your rewrite must have NONE
- If the original mentions no specific people, do NOT add names
- Every claim in your rewrite MUST exist in the original
- You are REARRANGING words, not creating new content

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Round ${round}. Rewrite this tweet 3 ways in the SAME LANGUAGE as the original.

ABSOLUTE RULES:
1. Write in ${lang === 'tr' ? 'TURKISH' : 'ENGLISH'} — same language as the original
2. PRESERVE the original message, analogies, metaphors, and framing
3. NEVER invent new facts, numbers, statistics, or claims
4. NEVER replace the original's metaphor with a different one
5. If the original has NO numbers, your rewrite has NO numbers
6. Only change: word order, sentence structure, hook placement, ending
7. Each rewrite under 280 chars, 2 sentences max
8. NO emoji, NO hashtags, NO AI words (delve, landscape, leverage, unleash, paradigm)
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
