import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';
import { AIAnalyzer } from '@reach/ai-checks';
import type { AnalyzeRequest, AnalyzeResponse, ErrorResponse, AnalysisResult } from '@reach/shared-types';

const engine = new ScoreEngine(allClientRules);

const USAGE_LIMITS: Record<string, number> = {
  free: 3,
  starter: 50,
  pro: 150,
  team: 500,
};

export async function POST(request: NextRequest) {
  // 1. Verify auth
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  // 2. Rate limit
  const rateLimited = applyRateLimit(request, auth.userId);
  if (rateLimited) return rateLimited;

  // 3. Parse and validate
  const body: AnalyzeRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  // 4. Check usage limits
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found', code: 'UNAUTHORIZED' } satisfies ErrorResponse,
      { status: 401 }
    );
  }

  // Reset monthly count if needed
  const now = new Date();
  if (user.usageResetAt < new Date(now.getFullYear(), now.getMonth(), 1)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { monthlyUsageCount: 0, usageResetAt: now },
    });
    user.monthlyUsageCount = 0;
  }

  const limit = USAGE_LIMITS[user.subscriptionTier] ?? 3;
  if (user.monthlyUsageCount >= limit) {
    return NextResponse.json(
      { success: false, error: `Usage limit reached (${limit}/month). Upgrade for more.`, code: 'USAGE_EXCEEDED' } satisfies ErrorResponse,
      { status: 429 }
    );
  }

  // 5. Run client-side rules
  const clientResult = engine.evaluate({
    text: body.content,
    platform: body.platform ?? 'x',
    isThread: false,
    hasMedia: false,
  });

  // 6. Run AI analysis (if API key available)
  let serverResult = null;
  if (env.ANTHROPIC_API_KEY) {
    try {
      const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
      serverResult = await analyzer.fullAnalysis(body.content);
    } catch (error) {
      console.error('[Analyze] AI analysis failed, using client-only results:', error);
    }
  }

  // 7. Merge results
  const finalResult: AnalysisResult = {
    ...clientResult,
    isServerEnhanced: true,
    aiSlopScore: serverResult?.slopScore ?? null,
  };

  // Add server suggestions
  if (serverResult) {
    for (const sr of serverResult.serverRuleResults) {
      if (sr.triggered && sr.suggestion) {
        finalResult.suggestions.push({
          ruleId: sr.ruleId,
          severity: sr.severity,
          title: sr.ruleId === 'server-ai-slop' ? 'AI Slop Detection' : 'Hook Quality',
          description: sr.suggestion,
        });
      }
    }

    // Adjust score with server rule points
    const serverPoints = serverResult.serverRuleResults
      .filter(r => r.triggered)
      .reduce((sum, r) => sum + r.points, 0);
    finalResult.reachScore = Math.max(0, Math.min(100, finalResult.reachScore + serverPoints));
  }

  // 8. Increment usage and save analysis
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { monthlyUsageCount: { increment: 1 } },
    }),
    prisma.analysis.create({
      data: {
        userId: user.id,
        contentText: body.content,
        platform: body.platform ?? 'x',
        reachScore: finalResult.reachScore,
        hookScore: finalResult.breakdown.hook,
        structureScore: finalResult.breakdown.structure,
        engagementScore: finalResult.breakdown.engagement,
        penaltyTotal: finalResult.breakdown.penalties,
        bonusTotal: finalResult.breakdown.bonuses,
        aiSlopScore: serverResult?.slopScore ?? null,
        suggestions: JSON.parse(JSON.stringify(finalResult.suggestions)),
        ruleResults: JSON.parse(JSON.stringify(finalResult.highlights)),
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: finalResult } satisfies AnalyzeResponse);
}
