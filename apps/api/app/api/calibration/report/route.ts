import { NextResponse } from 'next/server';
import { generateCalibrationReport } from '@lib/calibration';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/calibration/report
 *
 * Returns a calibration report showing how well our predicted scores
 * correlate with actual tweet outcomes. Identifies which rules are
 * truly predictive vs noise, and generates calibrated weight recommendations.
 *
 * Data sources:
 *   - tracked_tweets + tweet_metrics (our DB)
 *   - ops DB (yellow-jacket) tweets with rating + engagement data
 */
export async function GET() {
  try {
    const report = await generateCalibrationReport();

    // Build a concise response (omit full data points for the API response)
    const response = {
      success: true,
      status: report.status,
      message: report.message,
      dataPointCount: report.dataPointCount,
      dataSources: report.dataSources,
      correlation: report.correlation,
      topPredictiveRules: report.topPredictiveRules.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        category: r.category,
        lift: r.lift,
        liftPercent: r.liftPercent,
        timesTriggered: r.timesTriggered,
        pValue: r.pValue,
      })),
      topNoiseRules: report.topNoiseRules.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        category: r.category,
        lift: r.lift,
        timesTriggered: r.timesTriggered,
      })),
      topHarmfulRules: report.topHarmfulRules.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        category: r.category,
        lift: r.lift,
        liftPercent: r.liftPercent,
        timesTriggered: r.timesTriggered,
        pValue: r.pValue,
      })),
      calibratedWeights: report.calibratedWeights,
      // Scatter plot data for dashboard: [predicted, actual] pairs
      chartData: report.dataPoints.map((dp) => ({
        predicted: dp.predictedScore,
        actual: dp.outcomeScore,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Calibration] Report generation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}
