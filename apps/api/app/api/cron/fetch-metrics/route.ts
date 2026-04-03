import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { env } from '@lib/env';
import { verifyCronAuth } from '@lib/cron-auth';
import { calculateOutcomeScore } from '@lib/outcome-scorer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = verifyCronAuth(request);
  if (denied) return denied;
  if (!env.TWITTER_API_IO_KEY) {
    return NextResponse.json(
      { success: false, error: 'Twitter API not configured', code: 'INTERNAL_ERROR' },
      { status: 503 },
    );
  }

  // Fetch all tracked tweets from the last 24 hours that have a tweet ID
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tweets = await prisma.trackedTweet.findMany({
    where: {
      xTweetId: { not: null },
      postedAt: { gte: since },
    },
    select: {
      id: true,
      xTweetId: true,
      reachScore: true,
    },
  });

  let updated = 0;

  for (const tweet of tweets) {
    if (!tweet.xTweetId) continue;

    try {
      const res = await fetch(
        `https://api.twitterapi.io/twitter/tweet?tweet_id=${tweet.xTweetId}`,
        {
          headers: {
            'X-API-Key': env.TWITTER_API_IO_KEY,
            Accept: 'application/json',
          },
        },
      );

      if (!res.ok) {
        console.error(`[Cron] Twitter API error for tweet ${tweet.xTweetId}: ${res.status}`);
        continue;
      }

      const json = await res.json();
      const metrics = json?.data?.public_metrics;
      if (!metrics) {
        console.error(`[Cron] No metrics in response for tweet ${tweet.xTweetId}`);
        continue;
      }

      // Calculate velocity score: engagement rate per view
      const totalEngagement =
        (metrics.like_count ?? 0) +
        (metrics.retweet_count ?? 0) +
        (metrics.reply_count ?? 0) +
        (metrics.quote_count ?? 0) +
        (metrics.bookmark_count ?? 0);
      const views = metrics.impression_count ?? 0;
      const velocityScore = views > 0 ? (totalEngagement / views) * 100 : null;

      await prisma.tweetMetric.create({
        data: {
          trackedTweetId: tweet.id,
          likes: metrics.like_count ?? 0,
          retweets: metrics.retweet_count ?? 0,
          replies: metrics.reply_count ?? 0,
          quotes: metrics.quote_count ?? 0,
          bookmarks: metrics.bookmark_count ?? 0,
          views: metrics.impression_count ?? 0,
          velocityScore,
        },
      });

      // Calculate and log outcome score for feedback loop
      const likeCount = metrics.like_count ?? 0;
      const retweetCount = metrics.retweet_count ?? 0;
      const replyCount = metrics.reply_count ?? 0;
      const quoteCount = metrics.quote_count ?? 0;
      const bookmarkCount = metrics.bookmark_count ?? 0;
      const impressionCount = metrics.impression_count ?? 0;

      const outcomeScore = calculateOutcomeScore({
        likes: likeCount,
        retweets: retweetCount,
        replies: replyCount,
        quotes: quoteCount,
        bookmarks: bookmarkCount,
        views: impressionCount,
      });
      console.log(
        `[Metrics] Tweet ${tweet.xTweetId}: outcome=${outcomeScore}, predicted=${tweet.reachScore}`,
      );

      updated++;
    } catch (error) {
      console.error(`[Cron] Failed to fetch metrics for tweet ${tweet.xTweetId}:`, error);
    }
  }

  return NextResponse.json({ success: true, updated });
}
