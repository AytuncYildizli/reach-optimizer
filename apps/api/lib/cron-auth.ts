import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * Verify a cron/operator request. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set on the project.
 *
 * Without a CRON_SECRET, requests are allowed only in local development; in
 * production the routes fail closed instead of running for anyone.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  if (!env.CRON_SECRET) {
    if (process.env.NODE_ENV !== 'production') return null; // local dev
    console.error('[cron-auth] CRON_SECRET is not set; rejecting request');
    return unauthorized();
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearer && safeEqual(bearer, env.CRON_SECRET)) return null;

  return unauthorized();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}
