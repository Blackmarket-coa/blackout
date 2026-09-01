/**
 * The Circle graph: a directional edge means `followerId` has put `followeeId`
 * in their Circle. Following builds *your* Circle and needs no approval from the
 * other person; when two people follow each other their circles **overlap**,
 * which is the only thing "mutual" means here. There is no separate mutual
 * table and no request/accept handshake.
 *
 * Ids are Blackout user ids (the JWT `sub` / `UserRecord.id`), matching
 * `invitations.createdBy`.
 *
 * Durability: edges live in the `circle_edges` table via the write-through store
 * (migration 085). This module used to hold them in a process-memory Map that
 * reset on every restart — every Circle/Reach feature reads this graph, so that
 * was not survivable. The function signatures are unchanged so existing callers
 * (`routes/follows.ts`, `services/invitations.ts`, the social-graph export) did
 * not have to move.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { CircleEdgeRecord } from '../db/types';

/** @deprecated Name kept for existing callers; this is a Circle edge. */
export type FollowEdgeRecord = CircleEdgeRecord;

export type FollowOutcome =
    | { kind: 'ok'; record: FollowEdgeRecord; created: boolean }
    | { kind: 'self' };

/** Idempotent: re-following an already-followed user returns the existing edge. */
export function followUser(followerId: string, followeeId: string): FollowOutcome {
    if (followerId === followeeId) return { kind: 'self' };
    const existing = db.getCircleEdge(followerId, followeeId);
    if (existing) return { kind: 'ok', record: existing, created: false };
    const record = db.addCircleEdge({ id: randomUUID(), followerId, followeeId });
    return { kind: 'ok', record, created: true };
}

/** Returns true when an edge existed and was removed. */
export function unfollowUser(followerId: string, followeeId: string): boolean {
    return db.removeCircleEdge(followerId, followeeId);
}

export function isFollowing(followerId: string, followeeId: string): boolean {
    return db.getCircleEdge(followerId, followeeId) !== undefined;
}

/** Users that `followerId` follows — their Circle. Newest first. */
export function listFollowing(followerId: string): FollowEdgeRecord[] {
    return db.listCircleFollowing(followerId);
}

/** Users that follow `followeeId` — who holds them in their Circle. Newest first. */
export function listFollowers(followeeId: string): FollowEdgeRecord[] {
    return db.listCircleFollowers(followeeId);
}

export function followCounts(userId: string): { followers: number; following: number } {
    return {
        followers: db.listCircleFollowers(userId).length,
        following: db.listCircleFollowing(userId).length,
    };
}

/**
 * The people whose Circle overlaps `userId`'s — edges pointing both ways.
 * Derived on read rather than stored, so an overlap can never drift out of sync
 * with the two edges that constitute it.
 */
export function mutualsOf(userId: string): string[] {
    const following = new Set(db.listCircleFollowing(userId).map((e) => e.followeeId));
    return db
        .listCircleFollowers(userId)
        .map((e) => e.followerId)
        .filter((id) => following.has(id));
}

/** True when both edges exist — the two circles overlap. */
export function circlesOverlap(a: string, b: string): boolean {
    return isFollowing(a, b) && isFollowing(b, a);
}

/** Test-only helper used to reset state between integration tests. */
export function __resetFollowsForTests(): void {
    db.circleEdges.clear();
}
