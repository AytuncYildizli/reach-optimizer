import { NextRequest, NextResponse } from 'next/server';
import { env } from '@lib/env';
import { prisma } from '@lib/db';
import { createToken } from '@lib/auth';
import type { AuthCallbackResponse, ErrorResponse } from '@reach/shared-types';


/**
 * Exchange auth code for token, fetch user, upsert DB, return JWT.
 */
async function handleOAuthCallback(
  code: string,
  codeVerifier: string,
): Promise<AuthCallbackResponse | ErrorResponse> {
  // Exchange code for access token
  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${env.APP_URL}/api/auth/callback`,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text().catch(() => '');
    console.error('[Auth] Token exchange failed:', tokenResponse.status, errText);
    return { success: false, error: 'Failed to exchange authorization code', code: 'INTERNAL_ERROR' };
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  // Fetch user profile from X API
  const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    return { success: false, error: 'Failed to fetch user profile', code: 'INTERNAL_ERROR' };
  }

  const userData = (await userResponse.json()) as {
    data: { id: string; username: string; name: string; profile_image_url?: string };
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

  const token = await createToken(user.id);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      xUsername: user.xUsername,
      xDisplayName: user.xDisplayName,
      xProfileImage: user.xProfileImage ?? '',
    },
  };
}

/**
 * GET — browser redirect from X OAuth (user lands here after authorizing).
 * Returns an HTML page that posts the result back to the extension popup.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return new NextResponse('Missing code or state', { status: 400 });
  }

  // Verify state matches cookie
  const savedState = request.cookies.get('x_oauth_state')?.value;
  if (savedState && savedState !== state) {
    return new NextResponse('Invalid state — possible CSRF attack', { status: 403 });
  }

  // Get PKCE verifier from cookie (set during /api/auth/login)
  const codeVerifier = request.cookies.get('x_pkce_verifier')?.value || '';
  if (!codeVerifier) {
    return new NextResponse('Missing PKCE verifier — cookies may be blocked', { status: 400 });
  }

  try {
    const result = await handleOAuthCallback(code, codeVerifier);

    // Clear auth cookies
    const response = new NextResponse(
      `<!DOCTYPE html>
<html><head><title>ReachOS — Login Success</title></head>
<body style="background:#000;color:#e7e9ea;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <h1 style="color:#00ba7c">Login Successful!</h1>
  <p>You can close this tab and return to the extension.</p>
  <script>
    // Send result to extension popup via postMessage
    try {
      window.opener?.postMessage(${JSON.stringify({ type: 'REACHOS_AUTH', ...result })}, '*');
    } catch(e) {}
    // Also try chrome.runtime.sendMessage for direct extension communication
    try {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage(${JSON.stringify({ type: 'AUTH_CALLBACK', ...result })});
      }
    } catch(e) {}
    // Store token for extension to pick up
    try {
      localStorage.setItem('reachos_auth', JSON.stringify(${JSON.stringify(result)}));
    } catch(e) {}
    setTimeout(() => window.close(), 3000);
  </script>
</div>
</body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );

    response.cookies.delete('x_pkce_verifier');
    response.cookies.delete('x_oauth_state');

    return response;
  } catch {
    return new NextResponse('Authentication failed', { status: 500 });
  }
}

/**
 * POST — extension service worker sends code directly (no browser redirect).
 * Used when extension intercepts the redirect URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.code) {
      return NextResponse.json(
        { success: false, error: 'Missing code', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
        { status: 400 },
      );
    }

    // Extension-initiated flow uses plain verifier (no cookie available)
    const codeVerifier = body.code_verifier || '';
    const result = await handleOAuthCallback(body.code, codeVerifier);

    if (!('token' in result)) {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
