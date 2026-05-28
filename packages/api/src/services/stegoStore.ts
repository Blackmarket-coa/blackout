import { createHash } from 'node:crypto';
import { hashPassword } from './auth';

export type StegoCarrier = 'text' | 'image' | 'audio';
export type StegoEphemeralMode = 'persistent' | 'expire_after_hours' | 'delete_on_read';
export type StegoChannelExpiryReason =
    | 'ttl_elapsed'
    | 'read_consumed'
    | 'operator_revoked'
    | 'policy_archived';

export interface StegoChannelSnapshot {
    channelId: string;
    name: string;
    audience: string;
    carrier: StegoCarrier;
    ephemeralMode: StegoEphemeralMode;
    ttlHours?: number;
    rotationDays: number;
    createdAt: string;
    rotationIndex: number;
    lastRotatedAt?: string;
    expiredAt?: string;
    expiryReason?: StegoChannelExpiryReason;
}

export interface CreateStegoChannelInput {
    name: string;
    audience: string;
    carrier: StegoCarrier;
    ephemeralMode: StegoEphemeralMode;
    rotationDays: number;
    ttlHours?: number;
    passphrase: string;
}

export interface RotateStegoChannelInput {
    passphrase: string;
    rotatedAt?: string;
}

interface StoredRecord {
    snapshot: StegoChannelSnapshot;
    passphraseHash: string;
    materialFingerprint: string;
}

const subjects = new Map<string, Map<string, StoredRecord>>();

export function normalizeStegoChannelId(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function fingerprintFor(passphrase: string, salt: string): string {
    return createHash('sha256').update(`${salt}:${passphrase}`).digest('hex');
}

function getOrCreateBucket(subject: string): Map<string, StoredRecord> {
    let bucket = subjects.get(subject);
    if (!bucket) {
        bucket = new Map();
        subjects.set(subject, bucket);
    }
    return bucket;
}

export function listChannels(subject: string): StegoChannelSnapshot[] {
    const bucket = subjects.get(subject);
    if (!bucket) return [];
    return [...bucket.values()].map((entry) => entry.snapshot);
}

export function fetchChannel(subject: string, channelId: string): StegoChannelSnapshot | null {
    return subjects.get(subject)?.get(channelId)?.snapshot ?? null;
}

export class StegoChannelExistsError extends Error {
    constructor(public readonly channelId: string) {
        super(`stego channel already exists: ${channelId}`);
        this.name = 'StegoChannelExistsError';
    }
}

export async function createChannel(
    subject: string,
    input: CreateStegoChannelInput,
): Promise<{ snapshot: StegoChannelSnapshot; materialFingerprint: string }> {
    const bucket = getOrCreateBucket(subject);
    const channelId = normalizeStegoChannelId(input.name);
    if (!channelId) {
        throw new Error('invalid_name');
    }
    if (bucket.has(channelId)) {
        throw new StegoChannelExistsError(channelId);
    }
    const createdAt = new Date().toISOString();
    const snapshot: StegoChannelSnapshot = {
        channelId,
        name: input.name,
        audience: input.audience,
        carrier: input.carrier,
        ephemeralMode: input.ephemeralMode,
        ttlHours: input.ephemeralMode === 'expire_after_hours' ? input.ttlHours : undefined,
        rotationDays: Math.max(0, Math.floor(input.rotationDays || 0)),
        createdAt,
        rotationIndex: 0,
    };
    const passphraseHash = await hashPassword(input.passphrase);
    const materialFingerprint = fingerprintFor(input.passphrase, channelId);
    bucket.set(channelId, { snapshot, passphraseHash, materialFingerprint });
    return { snapshot, materialFingerprint };
}

export class StegoChannelNotFoundError extends Error {
    constructor(public readonly channelId: string) {
        super(`stego channel not found: ${channelId}`);
        this.name = 'StegoChannelNotFoundError';
    }
}

export async function rotateChannel(
    subject: string,
    channelId: string,
    input: RotateStegoChannelInput,
): Promise<{ snapshot: StegoChannelSnapshot; materialFingerprint: string }> {
    const bucket = subjects.get(subject);
    const record = bucket?.get(channelId);
    if (!record) throw new StegoChannelNotFoundError(channelId);
    if (record.snapshot.expiredAt) {
        throw new Error('channel_expired');
    }
    const rotatedAt = input.rotatedAt ?? new Date().toISOString();
    const nextSnapshot: StegoChannelSnapshot = {
        ...record.snapshot,
        rotationIndex: record.snapshot.rotationIndex + 1,
        lastRotatedAt: rotatedAt,
    };
    const materialFingerprint = fingerprintFor(input.passphrase, `${channelId}:${nextSnapshot.rotationIndex}`);
    bucket!.set(channelId, {
        snapshot: nextSnapshot,
        passphraseHash: await hashPassword(input.passphrase),
        materialFingerprint,
    });
    return { snapshot: nextSnapshot, materialFingerprint };
}

export function expireChannel(
    subject: string,
    channelId: string,
    reason: StegoChannelExpiryReason,
): StegoChannelSnapshot {
    const bucket = subjects.get(subject);
    const record = bucket?.get(channelId);
    if (!record) throw new StegoChannelNotFoundError(channelId);
    if (record.snapshot.expiredAt) {
        return record.snapshot;
    }
    const nextSnapshot: StegoChannelSnapshot = {
        ...record.snapshot,
        expiredAt: new Date().toISOString(),
        expiryReason: reason,
    };
    bucket!.set(channelId, { ...record, snapshot: nextSnapshot });
    return nextSnapshot;
}

/** Test-only helper used to reset state between integration tests. */
export function __resetStegoStoreForTests(): void {
    subjects.clear();
}
