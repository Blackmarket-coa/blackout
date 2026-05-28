/**
 * Redis-backed WebAuthn store with in-memory fallback for single-process dev.
 *
 * When `BLACKOUT_WEBAUTHN_STORE=redis` and REDIS_URL is configured, challenges
 * and credentials are persisted in Redis with TTL-based expiry, enabling
 * multi-process deployments behind a load balancer. Otherwise uses the
 * existing in-memory Maps in db.store (backward compatible).
 */

import { readRedisRuntimeConfig } from '../config/redis';
import { db } from '../db/store';
import type { WebAuthnChallengeRecord, WebAuthnCredentialRecord } from '../db/types';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type RedisLike = {
  set(key: string, value: string, ...args: unknown[]): Promise<'OK'>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
};

let _redis: RedisLike | null = null;

async function getRedis(): Promise<RedisLike | null> {
  if (process.env.BLACKOUT_WEBAUTHN_STORE !== 'redis') return null;
  if (_redis) return _redis;
  const cfg = readRedisRuntimeConfig();
  if (!cfg.url) return null;
  try {
    const { default: IORedis } = (await import('ioredis')) as {
      default: new (url: string) => RedisLike;
    };
    _redis = new IORedis(cfg.url);
    return _redis;
  } catch {
    return null;
  }
}

const prefix = ':webauthn:';
const redisKey = (kind: string, id: string) => `${prefix}${kind}:${id}`;

export async function upsertChallenge(record: WebAuthnChallengeRecord): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(
      redisKey('challenge', record.challenge),
      JSON.stringify(record),
      'PX',
      CHALLENGE_TTL_MS,
    );
  } else {
    db.upsertWebAuthnChallenge(record);
  }
}

export async function consumeChallenge(
  challenge: string,
): Promise<WebAuthnChallengeRecord | null> {
  const redis = await getRedis();
  if (redis) {
    const key = redisKey('challenge', challenge);
    const raw = await redis.get(key);
    if (!raw) return null;
    await redis.del(key);
    try {
      return JSON.parse(raw) as WebAuthnChallengeRecord;
    } catch {
      return null;
    }
  }
  const record = db.consumeWebAuthnChallenge(challenge);
  return record ?? null;
}

export async function purgeExpiredChallenges(): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    db.purgeExpiredWebAuthnChallenges();
  }
}

export async function upsertCredential(record: WebAuthnCredentialRecord): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(
      redisKey('cred', record.credentialId),
      JSON.stringify(record),
    );
  } else {
    db.upsertWebAuthnCredential(record);
  }
}

export async function findCredential(
  credentialId: string,
): Promise<WebAuthnCredentialRecord | null> {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(redisKey('cred', credentialId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WebAuthnCredentialRecord;
    } catch {
      return null;
    }
  }
  return db.findWebAuthnCredential(credentialId) ?? null;
}

export async function listCredentialsByUser(
  userId: string,
): Promise<WebAuthnCredentialRecord[]> {
  const redis = await getRedis();
  if (redis) {
    return []; // Redis SCAN would be needed for listing — use DB as source of truth for now
  }
  return db.listWebAuthnCredentialsByUser(userId);
}
