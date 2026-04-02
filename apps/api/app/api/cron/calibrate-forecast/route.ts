import { NextResponse } from 'next/server';
import { prisma } from '@lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/calibrate-forecast
 *
 * Compares predicted reach vs actual views for tracked tweets,
 * computes a per-user correction factor, and stores it for the
 * forecast engine to self-correct over time.
 *
 * Runs daily after fetch-metrics and learn-weights.
 */
export async function GET() {
  try {
    console.log('[calibrate-forecast] Starting forecast calibration...');

    // 1. Find all tracked tweets that have both predictedReach AND actual views
    const tweets = await prisma.trackedTweet.findMany({
      where: {
        predictedReach: { not: null },
        metrics: { some: { views: { gt: 0 } } },
      },
      include: {
        metrics: {
          orderBy: { measuredAt: 'desc' },
          take: 1,
        },
      },
    });

    if (tweets.length < 3) {
      console.log(`[calibrate-forecast] Only ${tweets.length} tweets with predictions+metrics. Need 3+. Skipping.`);
      return NextResponse.json({
        success: true,
        message: `Not enough data yet (${tweets.length}/3 minimum). Skipping calibration.`,
        tweetsAnalyzed: tweets.length,
      });
    }

    // 2. Group by user for per-user calibration
    const byUser = new Map<string, Array<{ predicted: number; actual: number }>>();
    const globalPairs: Array<{ predicted: number; actual: number }> = [];

    for (const tweet of tweets) {
      if (!tweet.predictedReach || tweet.metrics.length === 0) continue;
      const actual = tweet.metrics[0].views;
      if (actual <= 0) continue;

      const pair = { predicted: tweet.predictedReach, actual };
      globalPairs.push(pair);

      if (tweet.userId) {
        if (!byUser.has(tweet.userId)) byUser.set(tweet.userId, []);
        byUser.get(tweet.userId)!.push(pair);
      }
    }

    // 3. Compute global calibration
    const globalCalibration = computeCalibration(globalPairs);
    console.log(
      `[calibrate-forecast] Global: ${globalPairs.length} pairs, ` +
      `correction=${globalCalibration.correctionFactor.toFixed(3)}, ` +
      `avgError=${globalCalibration.meanAbsoluteErrorPct.toFixed(1)}%`,
    );

    // 4. Compute per-user calibration and save
    let usersUpdated = 0;
    const perUserResults: Record<string, {
      pairs: number;
      correctionFactor: number;
      meanAbsoluteErrorPct: number;
    }> = {};

    for (const [userId, pairs] of byUser) {
      if (pairs.length < 3) continue; // need at least 3 data points

      const calibration = computeCalibration(pairs);

      await prisma.user.update({
        where: { id: userId },
        data: {
          forecastCalibration: {
            correctionFactor: calibration.correctionFactor,
            meanAbsoluteErrorPct: calibration.meanAbsoluteErrorPct,
            dataPoints: pairs.length,
            lastCalibratedAt: new Date().toISOString(),
          },
        },
      });

      usersUpdated++;
      perUserResults[userId] = {
        pairs: pairs.length,
        correctionFactor: calibration.correctionFactor,
        meanAbsoluteErrorPct: calibration.meanAbsoluteErrorPct,
      };

      console.log(
        `[calibrate-forecast] User ${userId}: ${pairs.length} pairs, ` +
        `correction=${calibration.correctionFactor.toFixed(3)}, ` +
        `avgError=${calibration.meanAbsoluteErrorPct.toFixed(1)}%`,
      );
    }

    console.log(
      `[calibrate-forecast] Complete. ${usersUpdated} users calibrated from ${globalPairs.length} total predictions.`,
    );

    return NextResponse.json({
      success: true,
      global: globalCalibration,
      tweetsAnalyzed: globalPairs.length,
      usersCalibrated: usersUpdated,
      perUser: perUserResults,
    });
  } catch (error) {
    console.error('[calibrate-forecast] Cron failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * Compute calibration metrics from prediction/actual pairs.
 *
 * correctionFactor: multiply predictions by this to center them on actuals.
 *   - 1.0 = predictions are perfectly calibrated
 *   - 0.7 = predictions are 30% too high (scale them down)
 *   - 1.4 = predictions are 30% too low (scale them up)
 *
 * Uses median ratio (actual/predicted) to be robust against outliers.
 */
function computeCalibration(pairs: Array<{ predicted: number; actual: number }>) {
  // Correction factor: median of (actual / predicted)
  const ratios = pairs
    .filter(p => p.predicted > 0)
    .map(p => p.actual / p.predicted);

  ratios.sort((a, b) => a - b);
  const median = ratios.length % 2 === 0
    ? (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2
    : ratios[Math.floor(ratios.length / 2)];

  // Clamp correction factor to prevent wild swings
  const correctionFactor = Math.max(0.3, Math.min(3.0, median));

  // Mean absolute percentage error
  const errors = pairs
    .filter(p => p.actual > 0)
    .map(p => Math.abs(p.predicted - p.actual) / p.actual * 100);
  const meanAbsoluteErrorPct = errors.length > 0
    ? errors.reduce((sum, e) => sum + e, 0) / errors.length
    : 0;

  return { correctionFactor, meanAbsoluteErrorPct, dataPoints: pairs.length };
}
