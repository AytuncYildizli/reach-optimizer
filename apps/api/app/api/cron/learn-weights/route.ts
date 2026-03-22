import { NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { analyzeRulePerformance, generateWeightAdjustments } from '@lib/weight-learner';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    // Analyze global rule performance (across all users)
    const globalPerformance = await analyzeRulePerformance();
    const globalAdjustments = generateWeightAdjustments(globalPerformance);

    // Also analyze per-user for personalized weights
    const users = await prisma.user.findMany({ select: { id: true, xUsername: true } });
    const perUserResults: Record<
      string,
      { performance: ReturnType<typeof generateWeightAdjustments> extends infer T ? T : never; adjustments: Record<string, number> }
    > = {};

    for (const user of users) {
      const perf = await analyzeRulePerformance(user.id);
      if (perf.length > 0) {
        perUserResults[user.xUsername] = {
          performance: generateWeightAdjustments(perf),
          adjustments: generateWeightAdjustments(perf),
        };
      }
    }

    return NextResponse.json({
      success: true,
      global: {
        rulesAnalyzed: globalPerformance.length,
        topRules: globalPerformance.slice(0, 10),
        suggestedAdjustments: globalAdjustments,
      },
      perUser: perUserResults,
      message:
        globalPerformance.length === 0
          ? 'Not enough data yet. Need 5+ tracked tweets with engagement metrics.'
          : `Analyzed ${globalPerformance.length} rules across tracked tweets.`,
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
