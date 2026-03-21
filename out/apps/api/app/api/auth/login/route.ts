import { NextResponse } from 'next/server';
import { env } from '@lib/env';

export async function GET() {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.X_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/auth/callback`,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: 'challenge',
    code_challenge_method: 'plain',
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

  return NextResponse.json({ authUrl, state });
}
