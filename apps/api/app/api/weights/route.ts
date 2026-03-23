import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { verifyToken } from '@lib/auth';
import { analyzeRulePerformance, generateWeightAdjustments } from '@lib/weight-learner';

export const runtime = 'nodejs';

/**
 * GET /api/weights — returns current weight adjustments for the user.
 * If user is authenticated and has personalized weights in DB, return those.
 * Otherwise fall back to global defaults.
 */
export async function GET(req: NextRequest) {
  // Try to get user-specific weights if authenticated
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  let userId: string | undefined;

  if (token) {
    const payload = await verifyToken(token);
    if (payload) userId = payload.userId;
  }

  try {
    // If authenticated, read personalized weights from DB first
    if (userId) {
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
