import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@lib/db';
import { verifyCronAuth } from '@lib/cron-auth';
import { runBacktest, type HistoryPost } from '@reach/rules-engine';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/calibrate-forecast
 *
 * Fits the same per-account ridge model the offline backtest uses.
 * A numeric forecast is stored only when the time-ordered holdout beats
 * that account's rolling-median reach. The old global multiplier
 * correction is not written: scaling a non-predictive score does not
 * make it a forecast.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronAuth(request);
  if (denied) return denied;
  try {
    const tweets = await prisma.trackedTweet.findMany({
      where: { metrics: { some: { views: { gt: 0 } } } },
      include: {
        metrics: { orderBy: { measuredAt: 'desc' }, take: 1 },
      },
    });

    const byUser = new Map<string, HistoryPost[]>();
    for (const tweet of tweets) {
      if (!tweet.userId || !tweet.content) continue;
      const metric = tweet.metrics[0];
      if (!metric || metric.views <= 0) continue;
      const post: HistoryPost = {
        id: tweet.id,
        createdAt: tweet.postedAt.toISOString(),
        text: tweet.content,
        kind: 'original',
        lang: /[ğüşıöçĞÜŞİÖÇ]/.test(tweet.content) ? 'tr' : 'en',
        mediaType: null,
        impressions: metric.views,
        likes: metric.likes,
        retweets: metric.retweets,
        replies: metric.replies,
        quotes: metric.quotes,
        bookmarks: metric.bookmarks,
        followerCount: null,
      };
      const list = byUser.get(tweet.userId) ?? [];
      list.push(post);
      byUser.set(tweet.userId, list);
    }

    const asOf = new Date();
    const users: Array<{
      userId: string;
      status: string;
      eligiblePosts: number;
      impressionsSpearman: number | null;
      baselineSpearman: number | null;
      impressionsMae: number | null;
      baselineMae: number | null;
      engagementSpearman: number | null;
      reason: string;
    }> = [];

    for (const [userId, posts] of byUser) {
      const report = runBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 3 });
      await prisma.user.update({
        where: { id: userId },
        data: {
          forecastCalibration: JSON.parse(JSON.stringify({
            correctionFactor: null,
            reachModel: report.snapshot,
          })) as Prisma.InputJsonValue,
        },
      });
      const impressions = report.snapshot.validation.impressions;
      const engagement = report.snapshot.validation.engagement;
      users.push({
        userId,
        status: report.snapshot.status,
        eligiblePosts: report.eligiblePosts,
        impressionsSpearman: impressions.spearman,
        baselineSpearman: impressions.baselineSpearman,
        impressionsMae: impressions.mae,
        baselineMae: impressions.baselineMae,
        engagementSpearman: engagement.spearman,
        reason: report.snapshot.reason,
      });
    }

    return NextResponse.json({
      success: true,
      usersCalibrated: users.filter((user) => user.status === 'calibrated').length,
      usersChecked: users.length,
      users,
    });
  } catch (error) {
    console.error('[calibrate-forecast] Cron failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
