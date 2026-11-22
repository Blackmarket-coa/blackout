// What people agreed to, server-side, so a feature that needs consent can
// check it and the person can see their own history
// (docs/coalitions/GEOCACHING_DESIGN.md §3).
//
// The disclosure text lives in the client, which sends the version it showed
// and the SHA-256 of that text. An agreement counts only at the version the
// server expects now: when the wording changes, the version goes up here and
// in the client, and everyone is asked again.
import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { UserConsentRecord } from '../db/types';

export const CONSENT_KINDS = {
    /** Placing, finding and seeing public geocaches; includes the 18+ statement. */
    'coalition-caches': { currentVersion: 1, requiresAge: true },
} as const;

export type ConsentKind = keyof typeof CONSENT_KINDS;

export const isConsentKind = (kind: string): kind is ConsentKind =>
    Object.prototype.hasOwnProperty.call(CONSENT_KINDS, kind);

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The person's agreement of this kind that is not withdrawn, if any. */
export const activeConsent = (userId: string, kind: ConsentKind): UserConsentRecord | undefined =>
    db.listUserConsents(userId).find((c) => c.kind === kind && c.withdrawnAt === null);

/** True when the person has agreed to the current wording (and confirmed their age, where asked). */
export const hasCurrentConsent = (userId: string, kind: ConsentKind): boolean => {
    const consent = activeConsent(userId, kind);
    const spec = CONSENT_KINDS[kind];
    if (!consent || consent.version !== spec.currentVersion) return false;
    return spec.requiresAge ? consent.ageConfirmed : true;
};

export type RecordConsentResult =
    | { ok: true; consent: UserConsentRecord }
    | { ok: false; reason: 'unknown_kind' | 'stale_version' | 'age_required' | 'bad_text_hash' };

export const recordConsent = (
    userId: string,
    input: { kind: string; version: number; textSha256: string; ageConfirmed: boolean }
): RecordConsentResult => {
    if (!isConsentKind(input.kind)) return { ok: false, reason: 'unknown_kind' };
    const spec = CONSENT_KINDS[input.kind];
    if (input.version !== spec.currentVersion) return { ok: false, reason: 'stale_version' };
    if (spec.requiresAge && !input.ageConfirmed) return { ok: false, reason: 'age_required' };
    if (!SHA256_HEX.test(input.textSha256)) return { ok: false, reason: 'bad_text_hash' };

    const now = new Date().toISOString();
    // A new agreement replaces the previous one of the same kind, which stays
    // in the history as withdrawn at the moment it was replaced.
    const previous = activeConsent(userId, input.kind);
    if (previous) db.withdrawUserConsent(previous.id, now);
    const consent = db.createUserConsent({
        id: randomUUID(),
        userId,
        kind: input.kind,
        version: input.version,
        textSha256: input.textSha256,
        ageConfirmed: input.ageConfirmed,
        grantedAt: now,
        withdrawnAt: null,
    });
    return { ok: true, consent };
};

/** Withdraw the person's active agreement of this kind. Undefined when there is none. */
export const withdrawConsent = (
    userId: string,
    kind: ConsentKind
): UserConsentRecord | undefined => {
    const active = activeConsent(userId, kind);
    if (!active) return undefined;
    return db.withdrawUserConsent(active.id, new Date().toISOString());
};
