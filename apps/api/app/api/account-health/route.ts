import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/db';
import { verifyToken } from '@lib/auth';
import type { AccountHealth, AccountHealthFactor, AccountHealthResponse, ErrorResponse } from '@reach/shared-types';

export const runtime = 'nodejs';

/**
 * GET /api/account-health
 * Fetches user's X profile data, calculates account health score and reach multiplier.
 * Research-backed: TweepCred factors, Premium boost, follower ratio, engagement rate.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: 'Invalid token', code: 'UNAUTHORIZED' } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  try {
    // Get user with access token
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        xAccessToken: true,
        xUserId: true,
        createdAt: true,
        subscriptionTier: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
        { status: 404 },
      );
    }

    // Fetch fresh profile data from X API
    const xProfile = await fetchXProfile(user.xAccessToken);

    if (!xProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch X profile — try re-logging in', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
        { status: 502 },
      );
    }

    // Get average engagement rate from tracked tweets
    const avgEngagement = await getAverageEngagement(user.id);

    // Calculate account health
    const health = calculateAccountHealth(
      xProfile,
      user.subscriptionTier !== 'free',
      avgEngagement,
    );

    return NextResponse.json({
      success: true,
      data: health,
    } satisfies AccountHealthResponse);
  } catch (error) {
    console.error('[account-health] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal error', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// X API Profile Fetch
// ---------------------------------------------------------------------------

interface XProfileData {
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  createdAt: string;      // ISO date
  isVerified: boolean;
}

async function fetchXProfile(accessToken: string): Promise<XProfileData | null> {
  try {
    const res = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=public_metrics,verified,created_at',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      console.error('[account-health] X API error:', res.status);
      return null;
    }

    const data = (await res.json()) as {
      data: {
        public_metrics: {
          followers_count: number;
          following_count: number;
          tweet_count: number;
        };
        verified: boolean;
        created_at: string;
      };
    };

    return {
      followersCount: data.data.public_metrics.followers_count,
      followingCount: data.data.public_metrics.following_count,
      tweetCount: data.data.public_metrics.tweet_count,
      createdAt: data.data.created_at,
      isVerified: data.data.verified,
    };
  } catch (err) {
    console.error('[account-health] X API fetch error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Average Engagement from Tracked Tweets
// ---------------------------------------------------------------------------

async function getAverageEngagement(userId: string): Promise<number | null> {
  const tweets = await prisma.trackedTweet.findMany({
    where: { userId },
    include: {
      metrics: {
        orderBy: { measuredAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { postedAt: 'desc' },
    take: 20,
  });

  const tweetsWithMetrics = tweets.filter(t => t.metrics.length > 0 && t.metrics[0].views > 0);
  if (tweetsWithMetrics.length < 3) return null; // not enough data

  const rates = tweetsWithMetrics.map(t => {
    const m = t.metrics[0];
    const engagements = m.likes + m.retweets + m.replies + m.bookmarks;
    return engagements / m.views;
  });

  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

// ---------------------------------------------------------------------------
// Account Health Calculation
// ---------------------------------------------------------------------------

function calculateAccountHealth(
  profile: XProfileData,
  isPremium: boolean,
  avgEngagementRate: number | null,
): AccountHealth {
  const factors: AccountHealthFactor[] = [];
  const now = Date.now();
  const accountAgeDays = Math.floor((now - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  // 1. Follower/Following Ratio (max 20)
  // Research: following >60% of followers = TweepCred penalty
  const ratio = profile.followersCount > 0
    ? profile.followersCount / Math.max(1, profile.followingCount)
    : 0;

  let ratioScore: number;
  let ratioStatus: AccountHealthFactor['status'];
  let ratioTip: string | undefined;

  if (ratio >= 3) {
    ratioScore = 20; ratioStatus = 'great';
  } else if (ratio >= 1.5) {
    ratioScore = 15; ratioStatus = 'good';
  } else if (ratio >= 0.8) {
    ratioScore = 10; ratioStatus = 'good';
  } else if (ratio >= 0.4) {
    ratioScore = 5; ratioStatus = 'warning';
    ratioTip = 'Following too many accounts relative to followers — reduce following count or grow followers';
  } else {
    ratioScore = 0; ratioStatus = 'critical';
    ratioTip = 'Following/follower ratio triggers TweepCred penalty — unfollow inactive accounts';
  }

  factors.push({
    name: 'Follower Ratio',
    score: ratioScore,
    maxScore: 20,
    status: ratioStatus,
    tip: ratioTip,
  });

  // 2. Account Age (max 20)
  // Research: new accounts start at -128 TweepCred, need time to build reputation
  let ageScore: number;
  let ageStatus: AccountHealthFactor['status'];
  let ageTip: string | undefined;

  if (accountAgeDays >= 730) { // 2+ years
    ageScore = 20; ageStatus = 'great';
  } else if (accountAgeDays >= 365) { // 1-2 years
    ageScore = 15; ageStatus = 'good';
  } else if (accountAgeDays >= 180) { // 6 months - 1 year
    ageScore = 10; ageStatus = 'good';
  } else if (accountAgeDays >= 30) { // 1-6 months
    ageScore = 5; ageStatus = 'warning';
    ageTip = 'Account is still new — consistent quality posting builds TweepCred over time';
  } else {
    ageScore = 0; ageStatus = 'critical';
    ageTip = 'Very new account — the algorithm severely limits distribution for new accounts';
  }

  factors.push({
    name: 'Account Age',
    score: ageScore,
    maxScore: 20,
    status: ageStatus,
    tip: ageTip,
  });

  // 3. Premium Status (max 25)
  // Research: Premium = 4x in-network, 2x out-of-network, ~10x total reach
  const premiumScore = isPremium || profile.isVerified ? 25 : 0;
  factors.push({
    name: 'Premium Status',
    score: premiumScore,
    maxScore: 25,
    status: isPremium || profile.isVerified ? 'great' : 'critical',
    tip: !isPremium && !profile.isVerified
      ? 'Premium accounts get ~10x more reach — the single biggest lever for visibility'
      : undefined,
  });

  // 4. Posting Activity (max 15)
  // Research: 2-5 tweets/day optimal, diminishing returns after 5
  const tweetsPerDay = accountAgeDays > 0 ? profile.tweetCount / accountAgeDays : 0;
  let activityScore: number;
  let activityStatus: AccountHealthFactor['status'];
  let activityTip: string | undefined;

  if (tweetsPerDay >= 2 && tweetsPerDay <= 5) {
    activityScore = 15; activityStatus = 'great';
  } else if (tweetsPerDay >= 1 && tweetsPerDay < 2) {
    activityScore = 10; activityStatus = 'good';
    activityTip = 'Posting 2-5x per day is optimal for the algorithm';
  } else if (tweetsPerDay >= 0.3) {
    activityScore = 5; activityStatus = 'warning';
    activityTip = 'Post more frequently — the algorithm rewards consistent daily activity';
  } else if (tweetsPerDay > 5) {
    activityScore = 8; activityStatus = 'warning';
    activityTip = 'High posting frequency — diminishing returns after 5 tweets/day';
  } else {
    activityScore = 0; activityStatus = 'critical';
    activityTip = 'Very low activity — the algorithm needs regular posting to build your distribution';
  }

  factors.push({
    name: 'Posting Activity',
    score: activityScore,
    maxScore: 15,
    status: activityStatus,
    tip: activityTip,
  });

  // 5. Engagement Rate (max 20)
  // Research: avg engagement on X is 0.045%. Top performers >0.1%
  let engagementScore: number;
  let engagementStatus: AccountHealthFactor['status'];
  let engagementTip: string | undefined;

  if (avgEngagementRate === null) {
    engagementScore = 10; engagementStatus = 'good'; // neutral — no data yet
    engagementTip = 'Track more tweets to measure your engagement rate';
  } else if (avgEngagementRate >= 0.001) { // 0.1%+
    engagementScore = 20; engagementStatus = 'great';
  } else if (avgEngagementRate >= 0.00045) { // 0.045%+ (platform average)
    engagementScore = 15; engagementStatus = 'good';
  } else if (avgEngagementRate >= 0.00029) { // 0.029%+ (median)
    engagementScore = 10; engagementStatus = 'warning';
    engagementTip = 'Below average engagement — focus on hooks and reply-generating content';
  } else {
    engagementScore = 5; engagementStatus = 'critical';
    engagementTip = 'Low engagement rate — prioritize questions and conversation-starting tweets';
  }

  factors.push({
    name: 'Engagement Rate',
    score: engagementScore,
    maxScore: 20,
    status: engagementStatus,
    tip: engagementTip,
  });

  // Calculate total health score (max 100)
  const healthScore = Math.min(100, factors.reduce((sum, f) => sum + f.score, 0));

  // Calculate reach multiplier
  let reachMultiplier: number;
  if (healthScore >= 80) reachMultiplier = 1.3;
  else if (healthScore >= 60) reachMultiplier = 1.1;
  else if (healthScore >= 40) reachMultiplier = 1.0;
  else if (healthScore >= 20) reachMultiplier = 0.8;
  else reachMultiplier = 0.6;

  return {
    healthScore,
    reachMultiplier,
    factors,
    isPremium: isPremium || profile.isVerified,
    followerCount: profile.followersCount,
    followingCount: profile.followingCount,
    tweetCount: profile.tweetCount,
    accountAgeDays,
    avgEngagementRate: avgEngagementRate,
    fetchedAt: new Date().toISOString(),
  };
}
