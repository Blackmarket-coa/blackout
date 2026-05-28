/**
 * Redis-backed WebAuthn store with in-memory fallback for single-process dev.
 *
 * WHAT THIS FILE DOES
 * Stores WebAuthn credentials and challenges durably. In single-process
 * deployments, falls back to the in-memory store. When Redis is configured
 * (via BLACKOUT_WEBAUTHN_STORE=redis), credentials survive server restarts
 * and challenges work across multiple replicas behind a load balancer.
 *
 * WHY IT EXISTS (THE MULTI-PROCESS PROBLEM)
 * The in-memory WebAuthn store (`services/webauthn.ts`) uses JavaScript
 * Maps — they exist only in one process's memory. In a multi-replica
 * deployment behind a load balancer, a challenge issued on Replica A
 * can't be consumed on Replica B (it doesn't exist there). This store
 * solves that by persisting to Redis, which all replicas share.
 *
 * KEY CONCEPT — Atomic GET + DELETE
 * The challenge consumption uses a Redis Lua EVAL script instead of
 * separate GET + DEL calls. If two replicas both GET the same challenge
 * before either DEL, both would think they consumed it (race condition).
 * The Lua script runs atomically: "get the value, if it exists delete it,
 * return it" — no other command can execute between the GET and DEL.
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
    // Atomic GET+DEL via Lua script — prevents race condition where
    // two consumers both read the same challenge before either deletes it.
    const script = `local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v`;
    const raw = await redis.eval(script, 1, key) as string | null;
    if (!raw) return null;
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

export const storeCredential = upsertCredential;

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
