import type { MatrixEvent } from 'matrix-js-sdk';

/**
 * Stage raise-hand signaling (stage channels, Phase 5 pure-code slice).
 *
 * Hands are plain timeline events (`co.bmc.stage.hand`) rather than room
 * state so any audience member can raise one at default power levels —
 * state events would require `events['co.bmc.stage.hand']` grants in
 * every stage room. The latest signal per sender wins; moderators (PL ≥
 * `STAGE_MODERATOR_PL`) can lower someone else's hand by sending
 * `{ raised: false, for: <userId> }`.
 *
 * A hand disappears from the queue when: the member lowers it, a
 * moderator lowers it, or the member joins the stage (speakers are
 * excluded from the queue).
 *
 * v1 caveat unchanged from StageSurface: the speaker/audience split is
 * still presentational — enforced listen-only needs the LiveKit runtime
 * binding (Phase 5 infra half).
 */

export const STAGE_HAND_EVENT_TYPE = 'co.bmc.stage.hand';
export const STAGE_MODERATOR_PL = 50;

export interface StageHandSignal {
    sender: string;
    ts: number;
    raised: boolean;
    /** Moderator form: acts on this user's hand instead of the sender's. */
    subject?: string;
    senderIsModerator: boolean;
}

export interface StageHandContent {
    raised: boolean;
    /** Moderator lower-hand target. */
    for?: string;
}

export const buildStageHandContent = (raised: boolean, subject?: string): StageHandContent =>
    subject ? { raised, for: subject } : { raised };

/** Extract a signal from a timeline event; null when it isn't a hand event. */
export const stageHandSignalFromEvent = (
    event: MatrixEvent,
    isModerator: (userId: string) => boolean
): StageHandSignal | null => {
    if (event.getType() !== STAGE_HAND_EVENT_TYPE) return null;
    const sender = event.getSender();
    if (!sender) return null;
    const content = event.getContent<{ raised?: unknown; for?: unknown }>();
    if (typeof content.raised !== 'boolean') return null;
    const subject = typeof content.for === 'string' ? content.for : undefined;
    return {
        sender,
        ts: event.getTs() ?? 0,
        raised: content.raised,
        subject,
        senderIsModerator: isModerator(sender),
    };
};

/**
 * Fold hand signals (any order) into the raised-hand queue, oldest raise
 * first. Rules:
 *   - a member's own latest signal decides their hand;
 *   - a moderator `for` signal overrides the target's hand when it is
 *     newer than the target's own latest signal (non-moderators cannot
 *     act on other people's hands, and nobody can raise a hand FOR
 *     someone else — `for` only lowers);
 *   - current speakers never queue.
 */
export const collectRaisedHands = (
    signals: StageHandSignal[],
    speakers: ReadonlySet<string>
): string[] => {
    interface HandState {
        raised: boolean;
        ts: number;
        raisedAt: number;
    }
    const hands = new Map<string, HandState>();
    const sorted = [...signals].sort((a, b) => a.ts - b.ts);
    for (const signal of sorted) {
        if (signal.subject) {
            if (!signal.senderIsModerator || signal.raised) continue;
            const current = hands.get(signal.subject);
            if (!current || signal.ts >= current.ts) {
                hands.set(signal.subject, { raised: false, ts: signal.ts, raisedAt: 0 });
            }
            continue;
        }
        const current = hands.get(signal.sender);
        hands.set(signal.sender, {
            raised: signal.raised,
            ts: signal.ts,
            raisedAt: signal.raised ? (current?.raised ? current.raisedAt : signal.ts) : 0,
        });
    }
    return [...hands.entries()]
        .filter(([userId, state]) => state.raised && !speakers.has(userId))
        .sort((a, b) => a[1].raisedAt - b[1].raisedAt)
        .map(([userId]) => userId);
};
