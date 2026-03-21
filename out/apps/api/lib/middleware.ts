import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './auth';
import { checkRateLimit } from './rate-limit';
import type { ErrorResponse } from '@reach/shared-types';

export interface AuthResult {
  userId: string;
}

export async function authenticateRequest(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Missing authorization', code: 'UNAUTHORIZED' } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  const auth = await verifyToken(authHeader.slice(7));
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  return auth;
}

export function applyRateLimit(request: NextRequest, identifier: string): NextResponse | null {
  const url = new URL(request.url);
  const { allowed, remaining, resetIn } = checkRateLimit(identifier, url.pathname);

  if (!allowed) {
    const response = NextResponse.json(
      {
        success: false,
        error: `Rate limited. Try again in ${Math.ceil(resetIn / 1000)}s`,
        code: 'RATE_LIMITED',
      } satisfies ErrorResponse,
      { status: 429 },
    );
    response.headers.set('X-RateLimit-Remaining', '0');
    response.headers.set('Retry-After', String(Math.ceil(resetIn / 1000)));
    return response;
  }

  return null; // allowed
}
