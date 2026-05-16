import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';
import { env } from '@lib/env';
import { ScoreEngine } from '@reach/rules-engine';
import { AIAnalyzer } from '@reach/ai-checks';
import { getCachedTrends, checkTrendingAlignment } from '@lib/trending';
import type {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  ErrorResponse,
  ScoreTier,
  Suggestion,
} from '@reach/shared-types';

// Tier ranges mirror packages/rules-engine/src/config/weights.json. We
// recompute tier here because AI/trending deltas can push the score across a
// tier boundary after engine.evaluate returned its initial tier.
function tierForScore(score: number): ScoreTier {
  if (score >= 80) return 'perfect';
  if (score >= 61) return 'excellent';
  if (score >= 41) return 'good';
  if (score >= 21) return 'below_average';
  return 'critical';
}

// Force Node.js runtime (Anthropic SDK needs net/tls)
export const runtime = 'nodejs';
export const maxDuration = 30;

const engine = new ScoreEngine();

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const body: AnalyzeRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  // AI analysis only modifies the AI suggestion list and aiSlopScore; it does
  // NOT replace the client's score. The client has the correct hasMedia /
  // hasVideo / isQuoteTweet context and scores authoritatively.
  let aiSlopScore: number | null = null;
  let aiPointsDelta = 0;
  const aiSuggestions: Suggestion[] = [];

  if (env.ANTHROPIC_API_KEY) {
    try {
      const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
      const serverResult = await analyzer.fullAnalysis(body.content);
      aiSlopScore = serverResult.slopScore;

      for (const sr of serverResult.serverRuleResults) {
        if (sr.triggered) {
          aiPointsDelta += sr.points;
          if (sr.suggestion) {
            aiSuggestions.push({
              ruleId: sr.ruleId,
              severity: sr.severity,
              title: sr.ruleId === 'server-ai-slop' ? 'AI Slop Detection' : 'Hook Quality',
              description: sr.suggestion,
            });
          }
        }
      }
    } catch (error) {
      console.error('[Analyze] AI analysis failed:', error);
    }
  }

  // Trending topic alignment (+5 bonus) — kept as a server-side overlay; treated
  // as a positive nudge to score, independent of the 22-signal model.
  let trendingAlignment: AnalysisResult['trendingAlignment'] = null;
  let trendingDelta = 0;
  try {
    const trendingData = await getCachedTrends();
    const alignment = checkTrendingAlignment(body.content, trendingData.trends);
    trendingAlignment = alignment;
    if (alignment.isAligned) {
      trendingDelta = alignment.bonusPoints;
      const trendNames = alignment.matchedTrends.map((t) => t.name).join(', ');
      aiSuggestions.push({
        ruleId: 'server-trending-boost',
        severity: 'positive',
        title: 'Trending Topic Boost',
        description: `Your tweet aligns with trending topic${alignment.matchedTrends.length > 1 ? 's' : ''}: ${trendNames}. +${alignment.bonusPoints} bonus points!`,
      });
    }
  } catch (error) {
    console.error('[Analyze] Trending alignment check failed (non-blocking):', error);
  }

  // Run the v4 engine server-side with the SAME composer context the client
  // sees, so persisted scores don't diverge from displayed scores. Falls back
  // to text-only evaluation for older clients that don't send the context.
  const serverResult = engine.evaluate({
    text: body.content,
    platform: body.platform ?? 'x',
    isThread: body.isThread ?? false,
    hasMedia: body.hasMedia ?? false,
    mediaType: body.mediaType,
    isQuoteTweet: body.isQuoteTweet,
    quotedText: body.quotedText,
    quotedMediaType: body.quotedMediaType,
  });

  const finalResult: AnalysisResult = {
    ...serverResult,
    isServerEnhanced: true,
    aiSlopScore,
    trendingAlignment,
  };
  finalResult.score = Math.max(0, Math.min(100, finalResult.score + aiPointsDelta + trendingDelta));
  // Recompute tier so direct API consumers see consistent score+tier pairs
  // even when the AI/trending delta crosses a band boundary.
  finalResult.tier = tierForScore(finalResult.score);
  finalResult.suggestions.push(...aiSuggestions);

  if (userId) {
    try {
      await prisma.$transaction([
        prisma.analysis.create({
          data: {
            userId,
            contentText: body.content,
            platform: body.platform ?? 'x',
            // Persist the v4 single score in the legacy reachScore column so
            // downstream analytics keep working without a schema migration.
            reachScore: finalResult.score,
            hookScore: 0,
            structureScore: 0,
            engagementScore: 0,
            penaltyTotal: 0,
            bonusTotal: 0,
            aiSlopScore,
            suggestions: JSON.parse(JSON.stringify(finalResult.suggestions)),
            ruleResults: JSON.parse(JSON.stringify(finalResult.signalScores)),
          },
        }),
      ]);
    } catch (err) {
      console.error('[Analyze] DB save failed (non-blocking):', err);
    }
  }

  const response: AnalyzeResponse & { serverDelta: number } = {
    success: true,
    data: finalResult,
    serverDelta: aiPointsDelta + trendingDelta,
  };
  return NextResponse.json(response);
}
