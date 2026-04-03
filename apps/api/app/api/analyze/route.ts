import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';
import { AIAnalyzer } from '@reach/ai-checks';
import { getCachedTrends, checkTrendingAlignment } from '@lib/trending';
import type { AnalyzeRequest, AnalyzeResponse, ErrorResponse, AnalysisResult } from '@reach/shared-types';

// Force Node.js runtime (Anthropic SDK needs net/tls)
export const runtime = 'nodejs';
export const maxDuration = 30;

const engine = new ScoreEngine(allClientRules);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // 1. Parse and validate body first
  const body: AnalyzeRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 }
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

  // 4. Run AI analysis only — client already scored the tweet with correct
  //    context (hasMedia, etc). Server only adds AI checks + trending.
  let aiSlopScore: number | null = null;
  let aiPointsDelta = 0;
  const aiSuggestions: AnalysisResult['suggestions'] = [];

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

  // 5. Trending topic alignment (+5 bonus)
  let trendingAlignment: AnalysisResult['trendingAlignment'] = null;
  let trendingDelta = 0;
  try {
    const trendingData = await getCachedTrends();
    const alignment = checkTrendingAlignment(body.content, trendingData.trends);
    trendingAlignment = alignment;

    if (alignment.isAligned) {
      trendingDelta = alignment.bonusPoints;
      const trendNames = alignment.matchedTrends.map(t => t.name).join(', ');
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

  // 6. Build server-only result — client will merge the DELTA, not replace its score.
  //    We still run rules server-side for the DB record, but the extension ignores
  //    the server reachScore and only uses aiPointsDelta + trendingDelta.
  const serverRulesResult = engine.evaluate({
    text: body.content,
    platform: body.platform ?? 'x',
    isThread: false,
    hasMedia: false,
  });

  const finalResult: AnalysisResult = {
    ...serverRulesResult,
    isServerEnhanced: true,
    aiSlopScore,
    trendingAlignment,
  };
  // Apply AI + trending deltas to the server-side score for DB storage
  finalResult.reachScore = Math.max(0, Math.min(100, finalResult.reachScore + aiPointsDelta + trendingDelta));
  finalResult.breakdown.bonuses += trendingDelta;
  finalResult.suggestions.push(...aiSuggestions);

  // 7. Save to DB only if authenticated
  if (userId) {
    try {
      await prisma.$transaction([
        prisma.analysis.create({
          data: {
            userId,
            contentText: body.content,
            platform: body.platform ?? 'x',
            reachScore: finalResult.reachScore,
            hookScore: finalResult.breakdown.hook,
            structureScore: finalResult.breakdown.structure,
            engagementScore: finalResult.breakdown.engagement,
            penaltyTotal: finalResult.breakdown.penalties,
            bonusTotal: finalResult.breakdown.bonuses,
            aiSlopScore: aiSlopScore,
            suggestions: JSON.parse(JSON.stringify(finalResult.suggestions)),
            ruleResults: JSON.parse(JSON.stringify(finalResult.highlights)),
          },
        }),
      ]);
    } catch (err) {
      console.error('[Analyze] DB save failed (non-blocking):', err);
    }
  }

  return NextResponse.json({
    success: true,
    data: finalResult,
    // Server-only deltas — client should ADD these to its own score
    // instead of replacing its score with the server's
    serverDelta: aiPointsDelta + trendingDelta,
  });
}
