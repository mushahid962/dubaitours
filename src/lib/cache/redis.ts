import 'server-only';
import { Redis } from '@upstash/redis';

/**
 * Redis is optional.
 *
 * `Redis.fromEnv()` throws when the variables are missing, which would crash
 * the app on a first deploy before anyone has signed up for Upstash. So the
 * client is created lazily and the cache degrades to a pass-through: slower,
 * still correct. Caching is a performance feature, never a correctness one.
 */
let client: Redis | null = null;
let checked = false;

export function getRedis(): Redis | null {
  if (checked) return client;
  checked = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[cache] Upstash is not configured — running without a cache.');
    }
    return null;
  }

  client = new Redis({ url, token });
  return client;
}

type CacheOptions = {
  /** Seconds the value stays fresh. */
  ttl: number;
  /** Tags let a mutation invalidate a family of keys in one call. */
  tags?: string[];
};

export async function cached<T>(
  key: string,
  options: CacheOptions,
  produce: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return produce();

  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch (error) {
    console.warn('[cache] read failed', key, error);
  }

  const value = await produce();

  try {
    const pipeline = redis.pipeline();
    pipeline.set(key, value, { ex: options.ttl });
    options.tags?.forEach((tag) => pipeline.sadd(`tag:${tag}`, key));
    await pipeline.exec();
  } catch (error) {
    console.warn('[cache] write failed', key, error);
  }

  return value;
}

export async function invalidateTags(...tags: string[]) {
  const redis = getRedis();
  if (!redis) return;

  const pipeline = redis.pipeline();
  for (const tag of tags) {
    const keys = await redis.smembers<string[]>(`tag:${tag}`);
    if (keys.length) pipeline.del(...keys);
    pipeline.del(`tag:${tag}`);
  }
  await pipeline.exec();
}

export const cacheKeys = {
  tour: (slug: string, locale: string) => `tour:${locale}:${slug}`,
  cityRail: (citySlug: string, locale: string) => `rail:city:${locale}:${citySlug}`,
  facets: (citySlug: string, locale: string) => `facets:${locale}:${citySlug}`,
  sitemapChunk: (kind: string, page: number) => `sitemap:${kind}:${page}`,
  availability: (optionId: string, month: string) => `avail:${optionId}:${month}`,
};
