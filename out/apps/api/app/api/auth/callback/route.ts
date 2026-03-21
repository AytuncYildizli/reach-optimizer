import { NextRequest, NextResponse } from 'next/server';
import { env } from '@lib/env';
import { prisma } from '@lib/db';
import { createToken } from '@lib/auth';
import type { AuthCallbackRequest, AuthCallbackResponse, ErrorResponse } from '@reach/shared-types';

const USAGE_LIMITS: Record<string, number> = {
  free: 25,
  starter: 100,
  pro: 500,
  team: 2000,
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AuthCallbackRequest;

    if (!body.code || !body.state) {
      const error: ErrorResponse = {
        success: false,
        error: 'Missing code or state parameter',
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: body.code,
        grant_type: 'authorization_code',
        redirect_uri: `${env.APP_URL}/api/auth/callback`,
        code_verifier: 'challenge',
      }),
    });

    if (!tokenResponse.ok) {
      const error: ErrorResponse = {
        success: false,
        error: 'Failed to exchange authorization code',
        code: 'INTERNAL_ERROR',
      };
      return NextResponse.json(error, { status: 502 });
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // Fetch user profile from X API
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const error: ErrorResponse = {
        success: false,
        error: 'Failed to fetch user profile',
        code: 'INTERNAL_ERROR',
      };
      return NextResponse.json(error, { status: 502 });
    }

    const userData = (await userResponse.json()) as {
      data: {
        id: string;
        username: string;
        name: string;
        profile_image_url?: string;
      };
    };

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { xUserId: userData.data.id },
      update: {
        xUsername: userData.data.username,
        xDisplayName: userData.data.name,
        xProfileImage: userData.data.profile_image_url ?? null,
        xAccessToken: tokenData.access_token,
        xRefreshToken: tokenData.refresh_token ?? null,
      },
      create: {
        xUserId: userData.data.id,
        xUsername: userData.data.username,
        xDisplayName: userData.data.name,
        xProfileImage: userData.data.profile_image_url ?? null,
        xAccessToken: tokenData.access_token,
        xRefreshToken: tokenData.refresh_token ?? null,
      },
    });

    // Create JWT
    const token = await createToken(user.id);

    const response: AuthCallbackResponse = {
      success: true,
      token,
      user: {
        id: user.id,
        xUsername: user.xUsername,
        xDisplayName: user.xDisplayName,
        xProfileImage: user.xProfileImage ?? '',
        subscriptionTier: user.subscriptionTier,
        monthlyUsageCount: user.monthlyUsageCount,
        monthlyUsageLimit: USAGE_LIMITS[user.subscriptionTier] ?? 25,
      },
    };

    return NextResponse.json(response);
  } catch {
    const error: ErrorResponse = {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(error, { status: 500 });
  }
}
