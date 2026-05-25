import { ROOM_ID_RE, type ColiseumCitation } from './citations';

/**
 * Coliseum live debate sessions. A session ties a debate topic to a real-time
 * room (the same `!room:server` convention used by the `live` citation kind)
 * and layers debate-specific structure on top: a moderator-gated speaking
 * queue and pinned evidence. Transport (voice/video) is provided elsewhere —
 * this module only models the session state and its transitions.
 *
 * All helpers are pure: they take a session and return a new session, so the
 * store can persist the result and tests can assert transitions without I/O.
 */

export type ColiseumLiveSessionStatus = 'scheduled' | 'live' | 'ended';

export type SpeakingSlotState = 'requested' | 'granted' | 'revoked';

export interface SpeakingSlot {
    userId: string;
    state: SpeakingSlotState;
    requestedAt: string;
    grantedAt?: string;
}

export type PinnedEvidence =
    | { kind: 'argument'; argumentId: string }
    | { kind: 'citation'; citation: ColiseumCitation };

export interface ColiseumLiveSession {
    id: string;
    topicId: string;
    roomId: string;
    moderatorIds: string[];
    status: ColiseumLiveSessionStatus;
    speakingQueue: SpeakingSlot[];
    pinnedEvidence: PinnedEvidence[];
    createdAt: string;
    startedAt?: string;
    endedAt?: string;
}

export function isValidLiveRoomId(value: unknown): value is string {
    return typeof value === 'string' && ROOM_ID_RE.test(value);
}

export function canModerateSession(session: ColiseumLiveSession, userId: string): boolean {
    return session.moderatorIds.includes(userId);
}

export function isGrantedSpeaker(session: ColiseumLiveSession, userId: string): boolean {
    return session.speakingQueue.some(
        (slot) => slot.userId === userId && slot.state === 'granted',
    );
}

/** Add or re-open a speaking request for a user. Idempotent per user. */
export function requestSlot(
    session: ColiseumLiveSession,
    userId: string,
    nowIso: string,
): ColiseumLiveSession {
    const existing = session.speakingQueue.find((slot) => slot.userId === userId);
    if (existing && existing.state !== 'revoked') return session;
    const queue = session.speakingQueue.filter((slot) => slot.userId !== userId);
    return {
        ...session,
        speakingQueue: [...queue, { userId, state: 'requested', requestedAt: nowIso }],
    };
}

export function grantSlot(
    session: ColiseumLiveSession,
    userId: string,
    nowIso: string,
): ColiseumLiveSession {
    let found = false;
    const speakingQueue = session.speakingQueue.map((slot) => {
        if (slot.userId !== userId) return slot;
        found = true;
        return { ...slot, state: 'granted' as const, grantedAt: nowIso };
    });
    if (!found) {
        speakingQueue.push({
            userId,
            state: 'granted',
            requestedAt: nowIso,
            grantedAt: nowIso,
        });
    }
    return { ...session, speakingQueue };
}

export function revokeSlot(session: ColiseumLiveSession, userId: string): ColiseumLiveSession {
    return {
        ...session,
        speakingQueue: session.speakingQueue.map((slot) =>
            slot.userId === userId ? { ...slot, state: 'revoked' as const } : slot,
        ),
    };
}

function sameEvidence(a: PinnedEvidence, b: PinnedEvidence): boolean {
    if (a.kind === 'argument' && b.kind === 'argument') return a.argumentId === b.argumentId;
    if (a.kind === 'citation' && b.kind === 'citation') {
        return JSON.stringify(a.citation) === JSON.stringify(b.citation);
    }
    return false;
}

export function pinEvidence(
    session: ColiseumLiveSession,
    evidence: PinnedEvidence,
): ColiseumLiveSession {
    if (session.pinnedEvidence.some((pinned) => sameEvidence(pinned, evidence))) return session;
    return { ...session, pinnedEvidence: [...session.pinnedEvidence, evidence] };
}

export function unpinEvidence(
    session: ColiseumLiveSession,
    evidence: PinnedEvidence,
): ColiseumLiveSession {
    return {
        ...session,
        pinnedEvidence: session.pinnedEvidence.filter((pinned) => !sameEvidence(pinned, evidence)),
    };
}

export function endSession(session: ColiseumLiveSession, nowIso: string): ColiseumLiveSession {
    if (session.status === 'ended') return session;
    return { ...session, status: 'ended', endedAt: nowIso };
}
