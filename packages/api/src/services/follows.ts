/**
 * In-memory one-way follow graph. Mirrors the standalone-module pattern used
 * by `profileStore.ts` (a plain module-level Map rather than a `db/store`
 * table) so it stays decoupled from the file-backed persistence layer.
 *
 * Edges are directional: `followerId -> followeeId`. Ids are Blackout user
 * ids (the JWT `sub` / `UserRecord.id`), matching `invitations.createdBy`.
 *
 * Durability note: like profiles and invitations, this is process-memory only
 * and resets on restart. Persisting to the DB schema is a follow-up.
 */
import { randomUUID } from 'node:crypto';

export interface FollowEdgeRecord {
    id: string;
    followerId: string;
    followeeId: string;
    createdAt: string;
}

const edges = new Map<string, FollowEdgeRecord>();

const edgeKey = (followerId: string, followeeId: string): string => `${followerId}->${followeeId}`;

export type FollowOutcome =
    | { kind: 'ok'; record: FollowEdgeRecord; created: boolean }
    | { kind: 'self' };

/** Idempotent: re-following an already-followed user returns the existing edge. */
export function followUser(followerId: string, followeeId: string): FollowOutcome {
    if (followerId === followeeId) return { kind: 'self' };
    const key = edgeKey(followerId, followeeId);
    const existing = edges.get(key);
    if (existing) return { kind: 'ok', record: existing, created: false };
    const record: FollowEdgeRecord = {
        id: randomUUID(),
        followerId,
        followeeId,
        createdAt: new Date().toISOString(),
    };
    edges.set(key, record);
    return { kind: 'ok', record, created: true };
}

/** Returns true when an edge existed and was removed. */
export function unfollowUser(followerId: string, followeeId: string): boolean {
    return edges.delete(edgeKey(followerId, followeeId));
}

export function isFollowing(followerId: string, followeeId: string): boolean {
    return edges.has(edgeKey(followerId, followeeId));
}

/** Users that `followerId` follows, newest first. */
export function listFollowing(followerId: string): FollowEdgeRecord[] {
    return [...edges.values()]
        .filter((e) => e.followerId === followerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Users that follow `followeeId`, newest first. */
export function listFollowers(followeeId: string): FollowEdgeRecord[] {
    return [...edges.values()]
        .filter((e) => e.followeeId === followeeId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function followCounts(userId: string): { followers: number; following: number } {
    let followers = 0;
    let following = 0;
    for (const edge of edges.values()) {
        if (edge.followeeId === userId) followers += 1;
        if (edge.followerId === userId) following += 1;
    }
    return { followers, following };
}

/** Test-only helper used to reset state between integration tests. */
export function __resetFollowsForTests(): void {
    edges.clear();
}
