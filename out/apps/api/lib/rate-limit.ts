interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60000);

export interface RateLimitConfig {
  windowMs: number; // Time window in ms
  maxRequests: number; // Max requests per window
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/analyze': { windowMs: 60000, maxRequests: 10 },
  '/api/suggest': { windowMs: 60000, maxRequests: 5 },
  '/api/auth/login': { windowMs: 60000, maxRequests: 10 },
  '/api/auth/callback': { windowMs: 60000, maxRequests: 10 },
  default: { windowMs: 60000, maxRequests: 30 },
};

export function checkRateLimit(
  identifier: string,
  endpoint: string,
): { allowed: boolean; remaining: number; resetIn: number } {
  const config = RATE_LIMITS[endpoint] ?? RATE_LIMITS.default;
  const key = `${identifier}:${endpoint}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetIn: entry.resetAt - now };
}
