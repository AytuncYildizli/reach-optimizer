import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * Verify cron request is authorized.
 * Checks for CRON_SECRET in Authorization header or query param.
 * If CRON_SECRET is not configured, allows all requests (dev mode).
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  if (!env.CRON_SECRET) return null; // no secret configured = allow (dev)

  const authHeader = request.headers.get('authorization');
  const querySecret = new URL(request.url).searchParams.get('secret');
  const bearer = authHeader?.replace('Bearer ', '');

  if (bearer === env.CRON_SECRET || querySecret === env.CRON_SECRET) {
    return null; // authorized
  }

  return NextResponse.json(
    { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}
