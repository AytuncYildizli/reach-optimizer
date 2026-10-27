import { NextRequest, NextResponse } from 'next/server';

/**
 * CORS for /api/*. Only the ReachOS extension (and origins listed in
 * ALLOWED_ORIGINS, comma-separated, e.g. an unpacked dev build's
 * chrome-extension://<id>) may call the API from a browser. The dashboard is
 * same-origin and needs no CORS headers.
 */
const STORE_EXTENSION_ORIGIN = 'chrome-extension://ligaanjkjpgaieabfmbeecehhhfoiecf';

function allowedOrigins(): Set<string> {
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([STORE_EXTENSION_ORIGIN, ...extra]);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = origin !== null && allowedOrigins().has(origin);

  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    if (allowed) for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
    res.headers.set('Vary', 'Origin');
    return res;
  }

  const res = NextResponse.next();
  if (allowed) for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  res.headers.set('Vary', 'Origin');
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
