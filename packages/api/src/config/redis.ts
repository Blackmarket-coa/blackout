export interface RedisRuntimeConfig {
  url: string | null;
  keyPrefix: string;
  rateLimitPrefix: string;
}

let cached: RedisRuntimeConfig | null = null;

export const clearRedisConfigCache = (): void => {
  cached = null;
};

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export const readRedisRuntimeConfig = (): RedisRuntimeConfig => {
  if (cached) return cached;

  const url = process.env.REDIS_URL?.trim() || null;

  if (!url && isProduction()) {
    throw new Error(
      'REDIS_URL is required in production. The rate limiter and other shared state require a Redis instance reachable from every replica.',
    );
  }

  if (url && !/^rediss?:\/\//.test(url)) {
    throw new Error('REDIS_URL must start with redis:// or rediss://');
  }

  const keyPrefix = process.env.REDIS_KEY_PREFIX?.trim() || 'blackout:';
  const rateLimitPrefix = `${keyPrefix}rl:`;

  cached = { url, keyPrefix, rateLimitPrefix };
  return cached;
};
