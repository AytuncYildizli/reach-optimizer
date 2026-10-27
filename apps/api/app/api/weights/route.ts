import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { authenticateRequest } from '@lib/middleware';
import { analyzeRulePerformance, generateWeightAdjustments } from '@lib/weight-learner';

export const runtime = 'nodejs';

/**
 * GET /api/weights — returns the signal weight adjustments for the signed-in
 * user: their personalized adjustments if the learn-weights cron has produced
 * any, otherwise the global ones. The extension applies these to its local
 * engine (see `ScoreEngine.evaluate(input, { adjustments })`).
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  try {
    // Personalized weights first
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { personalizedWeights: true },
    });

    const weights = user?.personalizedWeights as Record<string, number> | null;

    if (weights && Object.keys(weights).length > 0) {
      return NextResponse.json({
        type: 'personalized',
        userId,
        adjustments: weights,
        rulesCount: Object.keys(weights).length,
      });
    }

    // Fall back to global weights (computed on-the-fly since there's no global store)
    const globalPerformance = await analyzeRulePerformance();
    const globalAdjustments = generateWeightAdjustments(globalPerformance);

    return NextResponse.json({
      type: globalPerformance.length > 0 ? 'global' : 'default',
      adjustments: globalAdjustments,
      rulesAnalyzed: globalPerformance.length,
      message:
        globalPerformance.length === 0
          ? 'Not enough data yet. Using default weights.'
          : `Based on ${globalPerformance.length} rules analyzed globally.`,
    });
  } catch (error) {
    console.error('[weights] Failed to fetch weights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
