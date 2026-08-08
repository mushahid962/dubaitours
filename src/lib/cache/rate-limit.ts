import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './redis';

/**
 * Sliding-window limits, tuned per surface. Checkout is the strictest
 * because each attempt holds real inventory.
 */
const WINDOWS = {
  search:   { tokens: 60,  window: '1 m' },
  checkout: { tokens: 8,   window: '1 m' },
  auth:     { tokens: 5,   window: '5 m' },
  review:   { tokens: 5,   window: '1 h' },
  api:      { tokens: 120, window: '1 m' },
} as const;

export type LimiterName = keyof typeof WINDOWS;

const limiters = new Map<LimiterName, Ratelimit>();

function getLimiter(name: LimiterName): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  if (!limiters.has(name)) {
    const config = WINDOWS[name];
    limiters.set(name, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.tokens, config.window),
      prefix: `rl:${name}`,
    }));
  }
  return limiters.get(name)!;
}

export async function checkRateLimit(name: LimiterName, identifier: string) {
  const limiter = getLimiter(name);

  // Without Redis there is no shared counter, so requests are allowed
  // through. Fine for local development; configure Upstash before launch,
  // or checkout and sign-in have no abuse protection at all.
  if (!limiter) {
    return { success: true, limit: 0, remaining: 0, reset: 0, enforced: false };
  }

  const result = await limiter.limit(identifier);
  return { ...result, enforced: true };
}

/** Prefer the authenticated user id; fall back to the edge-provided IP. */
export function rateLimitIdentity(userId: string | null, ip: string | null) {
  return userId ? `u:${userId}` : `ip:${ip ?? 'unknown'}`;
}
