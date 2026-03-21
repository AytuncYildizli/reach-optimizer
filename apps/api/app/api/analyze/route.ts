import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { prisma } from '@lib/db';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';
import { AIAnalyzer } from '@reach/ai-checks';
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

  // 4. Run client-side rules (always works, auth or not)
  const clientResult = engine.evaluate({
    text: body.content,
    platform: body.platform ?? 'x',
    isThread: false,
    hasMedia: false,
  });

  // 5. Run AI analysis (if API key available)
  let serverResult = null;
  if (env.ANTHROPIC_API_KEY) {
    try {
      const analyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);
      serverResult = await analyzer.fullAnalysis(body.content);
    } catch (error) {
      console.error('[Analyze] AI analysis failed:', error);
    }
  }

  // 6. Merge results
  const finalResult: AnalysisResult = {
    ...clientResult,
    isServerEnhanced: true,
    aiSlopScore: serverResult?.slopScore ?? null,
  };

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

    const serverPoints = serverResult.serverRuleResults
      .filter(r => r.triggered)
      .reduce((sum, r) => sum + r.points, 0);
    finalResult.reachScore = Math.max(0, Math.min(100, finalResult.reachScore + serverPoints));
  }

  // 7. Save to DB only if authenticated
  if (userId) {
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { monthlyUsageCount: { increment: 1 } },
        }),
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
            aiSlopScore: serverResult?.slopScore ?? null,
            suggestions: JSON.parse(JSON.stringify(finalResult.suggestions)),
            ruleResults: JSON.parse(JSON.stringify(finalResult.highlights)),
          },
        }),
      ]);
    } catch (err) {
      console.error('[Analyze] DB save failed (non-blocking):', err);
    }
  }

  return NextResponse.json({ success: true, data: finalResult } satisfies AnalyzeResponse);
}
