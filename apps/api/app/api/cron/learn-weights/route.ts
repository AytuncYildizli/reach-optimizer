import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { analyzeRulePerformance, generateWeightAdjustments } from '@lib/weight-learner';
import { verifyCronAuth } from '@lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = verifyCronAuth(request);
  if (denied) return denied;
  try {
    console.log('[learn-weights] Starting weight learning cron...');

    // 1. Analyze global rule performance (across all users)
    console.log('[learn-weights] Analyzing global rule performance...');
    const globalPerformance = await analyzeRulePerformance();
    const globalAdjustments = generateWeightAdjustments(globalPerformance);
    console.log(
      `[learn-weights] Global: ${globalPerformance.length} rules analyzed, ${Object.keys(globalAdjustments).length} adjustments generated`,
    );

    // 2. Get all users who have tracked tweets (only they can benefit from personalized weights)
    const users = await prisma.user.findMany({
      where: {
        trackedTweets: {
          some: {},
        },
      },
      select: { id: true, xUsername: true },
    });
    console.log(`[learn-weights] Found ${users.length} users with tracked tweets`);

    // 3. Analyze per-user performance and save personalized weights
    const perUserResults: Record<
      string,
      { adjustments: Record<string, number>; rulesAnalyzed: number }
    > = {};
    let usersUpdated = 0;

    for (const user of users) {
      console.log(`[learn-weights] Analyzing user ${user.xUsername} (${user.id})...`);
      const perf = await analyzeRulePerformance(user.id);

      if (perf.length > 0) {
        const adjustments = generateWeightAdjustments(perf);

        if (Object.keys(adjustments).length > 0) {
          // Save personalized weights to User record
          await prisma.user.update({
            where: { id: user.id },
            data: {
              personalizedWeights: adjustments,
            },
          });
          usersUpdated++;
          console.log(
            `[learn-weights] User ${user.xUsername}: ${perf.length} rules analyzed, ${Object.keys(adjustments).length} weight adjustments saved`,
          );

          perUserResults[user.xUsername] = {
            adjustments,
            rulesAnalyzed: perf.length,
          };
        } else {
          console.log(
            `[learn-weights] User ${user.xUsername}: ${perf.length} rules analyzed, no significant adjustments`,
          );
        }
      } else {
        console.log(
          `[learn-weights] User ${user.xUsername}: not enough data (need 5+ tracked tweets with metrics)`,
        );
      }
    }

    console.log(
      `[learn-weights] Complete. ${usersUpdated}/${users.length} users updated with personalized weights`,
    );

    return NextResponse.json({
      success: true,
      global: {
        rulesAnalyzed: globalPerformance.length,
        topRules: globalPerformance.slice(0, 10),
        suggestedAdjustments: globalAdjustments,
      },
      perUser: perUserResults,
      usersProcessed: users.length,
      usersUpdated,
      message:
        globalPerformance.length === 0
          ? 'Not enough data yet. Need 5+ tracked tweets with engagement metrics.'
          : `Analyzed ${globalPerformance.length} rules globally. Updated ${usersUpdated} user(s) with personalized weights.`,
    });
  } catch (error) {
    console.error('[learn-weights] Cron failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
