import {
    computeTopicHeat,
    detectBilateralExchange,
    rankResponseDrops,
    responseDropVoteScore,
    type BilateralExchange,
    type ColiseumResponseDrop,
    type ColiseumShout,
    type ColiseumTopicCategoryKey,
    type RankedResponseDrop,
} from '@blackout/core';
import type { ColiseumArgumentMedia } from '@blackout/core';
import { db } from '../db/store';
import { createMatch } from './coliseumMatchStore';
import type { ColiseumMatch } from '@blackout/core';

function rand(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function newShoutId(): string {
    return rand('shout');
}
export function newDropId(): string {
    return rand('drop');
}

function dropsForShout(shoutId: string): ColiseumResponseDrop[] {
    return db.listColiseumResponseDrops().filter((d) => d.shoutId === shoutId);
}

function recomputeShoutHeat(shout: ColiseumShout, nowMs: number): ColiseumShout {
    const drops = dropsForShout(shout.id);
    const voteCount = db
        .listColiseumResponseDropVotes()
        .filter((v) => drops.some((d) => d.id === v.dropId)).length;
    const { debateHeat } = computeTopicHeat({
        publishedAt: shout.createdAt,
        createdAt: shout.createdAt,
        argumentCount: drops.length,
        voteCount,
        nowMs,
    });
    const next = { ...shout, heat: debateHeat };
    db.upsertColiseumShout(next);
    return next;
}

export interface CreateShoutInput {
    authorId: string;
    domain?: ColiseumTopicCategoryKey;
    body?: string;
    media: ColiseumArgumentMedia;
    denRoomId?: string;
}

export function createShout(input: CreateShoutInput, nowMs: number = Date.now()): ColiseumShout {
    const shout: ColiseumShout = {
        id: newShoutId(),
        authorId: input.authorId,
        domain: input.domain,
        body: input.body,
        media: input.media,
        denRoomId: input.denRoomId,
        createdAt: new Date(nowMs).toISOString(),
        heat: 0,
    };
    db.upsertColiseumShout(shout);
    return recomputeShoutHeat(shout, nowMs);
}

export function getShout(id: string): ColiseumShout | null {
    return db.getColiseumShout(id) ?? null;
}

export function listShouts(filter: { domain?: ColiseumTopicCategoryKey } = {}): ColiseumShout[] {
    return db
        .listColiseumShouts()
        .filter((s) => (filter.domain ? s.domain === filter.domain : true))
        .sort((a, b) => b.heat - a.heat || b.createdAt.localeCompare(a.createdAt));
}

export interface PostResponseDropInput {
    shoutId: string;
    authorId: string;
    body?: string;
    media: ColiseumArgumentMedia;
}

export function postResponseDrop(
    input: PostResponseDropInput,
    nowMs: number = Date.now()
): ColiseumResponseDrop | null {
    const shout = db.getColiseumShout(input.shoutId);
    if (!shout) return null;
    const drop: ColiseumResponseDrop = {
        id: newDropId(),
        shoutId: input.shoutId,
        authorId: input.authorId,
        body: input.body,
        media: input.media,
        createdAt: new Date(nowMs).toISOString(),
        voteScore: 0,
    };
    db.upsertColiseumResponseDrop(drop);
    recomputeShoutHeat(shout, nowMs);
    return drop;
}

export function voteResponseDrop(
    dropId: string,
    voterId: string,
    direction: 'up' | 'down',
    nowMs: number = Date.now()
): ColiseumResponseDrop | null {
    const drop = db.getColiseumResponseDrop(dropId);
    if (!drop) return null;
    db.upsertColiseumResponseDropVote({
        dropId,
        voterId,
        direction,
        createdAt: new Date(nowMs).toISOString(),
    });
    const votes = db.listColiseumResponseDropVotes().filter((v) => v.dropId === dropId);
    let up = 0;
    let down = 0;
    for (const v of votes) {
        if (v.direction === 'up') up += 1;
        else down += 1;
    }
    const next = { ...drop, voteScore: responseDropVoteScore(up, down) };
    db.upsertColiseumResponseDrop(next);
    return next;
}

export function listRankedResponseDrops(shoutId: string): RankedResponseDrop[] {
    return rankResponseDrops(dropsForShout(shoutId));
}

/** Detect whether this shout thread has become a bilateral fight. */
export function detectShoutBilateral(shoutId: string): BilateralExchange | null {
    const shout = db.getColiseumShout(shoutId);
    if (!shout) return null;
    return detectBilateralExchange(shout, dropsForShout(shoutId));
}

/**
 * Graduate a bilateral shout exchange into a full Match. Called when both
 * parties consent to formalize. The shouter becomes the challenger (red) and the
 * responder the opponent (blue); the match opens already accepted (live).
 */
export function graduateToMatch(shoutId: string, nowMs: number = Date.now()): ColiseumMatch | null {
    const shout = db.getColiseumShout(shoutId);
    if (!shout) return null;
    const exchange = detectBilateralExchange(shout, dropsForShout(shoutId));
    if (!exchange) return null;

    const match = createMatch(
        {
            type: 'callout',
            proposition: shout.body ?? 'Shout graduated to match',
            domain: shout.domain,
            challengerId: exchange.shouterId,
            opponentId: exchange.responderId,
            denRoomId: shout.denRoomId,
            shoutId: shout.id,
        },
        nowMs
    );
    // Both parties have consented by graduating — open the match immediately.
    const nowIso = new Date(nowMs).toISOString();
    const live = {
        ...match,
        acceptedAt: nowIso,
        clockEndsAt: new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'live' as const,
    };
    db.upsertColiseumMatch(live);
    return live;
}
