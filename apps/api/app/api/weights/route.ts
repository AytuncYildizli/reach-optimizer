import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { analyzeRulePerformance, generateWeightAdjustments } from '@lib/weight-learner';

export const runtime = 'nodejs';

/**
 * GET /api/weights — returns current weight adjustments for the user.
 * If user has enough data, return personalized weights.
 * Otherwise return global defaults.
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
    // If authenticated, try personalized weights first
    if (userId) {
      const userPerformance = await analyzeRulePerformance(userId);
      if (userPerformance.length > 0) {
        const adjustments = generateWeightAdjustments(userPerformance);
        if (Object.keys(adjustments).length > 0) {
          return NextResponse.json({
            type: 'personalized',
            userId,
            adjustments,
            rulesAnalyzed: userPerformance.length,
            topRules: userPerformance.slice(0, 5),
          });
        }
      }
    }

    // Fall back to global weights
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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
