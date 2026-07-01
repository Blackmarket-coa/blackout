/**
 * Challenge Link status — the public, shareable state of a Callout.
 *
 * The link itself is a tokenized invitation (minted via the existing
 * invitations system); this module only models the *status* that rides on the
 * match. The `seen` and `declined` states are deliberately public: "They saw it.
 * They said nothing." is content.
 */

export type ColiseumChallengeStatus =
    | 'pending' // issued, not yet viewed
    | 'seen' // link opened, no response (token ping on preview)
    | 'declined' // recipient explicitly declined
    | 'accepted' // match is live
    | 'open'; // no specific target, waiting for any taker

export const COLISEUM_CHALLENGE_STATUSES: readonly ColiseumChallengeStatus[] = [
    'pending',
    'seen',
    'declined',
    'accepted',
    'open',
] as const;

export function isColiseumChallengeStatus(value: unknown): value is ColiseumChallengeStatus {
    return (
        typeof value === 'string' &&
        (COLISEUM_CHALLENGE_STATUSES as readonly string[]).includes(value)
    );
}

/** Human-facing label for a challenge status, for the dodge badge. */
export function challengeStatusLabel(status: ColiseumChallengeStatus): string {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'seen':
            return 'Seen, No Response';
        case 'declined':
            return 'Declined';
        case 'accepted':
            return 'Accepted';
        case 'open':
            return 'Open Challenge';
    }
}

/**
 * Whether a status is a "dodge" — publicly shareable as the recipient ducking
 * the challenge. Used to surface the dodge as content on the challenger's side.
 */
export function isDodge(status: ColiseumChallengeStatus): boolean {
    return status === 'seen' || status === 'declined';
}

/**
 * Derive the public challenge status from a match's link signals. Acceptance
 * (an opponent who has accepted) wins; then an explicit decline; then a seen
 * ping; an open challenge with no taker is `open`; otherwise `pending`.
 */
export function deriveChallengeStatus(signals: {
    accepted: boolean;
    declinedAt?: string;
    seenAt?: string;
    open?: boolean;
}): ColiseumChallengeStatus {
    if (signals.accepted) return 'accepted';
    if (signals.declinedAt) return 'declined';
    if (signals.open) return 'open';
    if (signals.seenAt) return 'seen';
    return 'pending';
}
