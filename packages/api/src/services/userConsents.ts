// What people agreed to, server-side, so a feature that needs consent can
// check it and the person can see their own history
// (docs/coalitions/GEOCACHING_DESIGN.md §3).
//
// The disclosure text is shared with the client (@blackout/core), which shows
// it and sends the version and the SHA-256 of the text it showed. An agreement
// counts only for the current version and only when that hash is the hash of
// the current text: when the wording changes, the version goes up, and
// everyone is asked again.
import { createHash, randomUUID } from 'node:crypto';
import { CACHE_DISCLOSURE, cacheDisclosureText } from '@blackout/core';
import { db } from '../db/store';
import type { UserConsentRecord } from '../db/types';

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const CONSENT_KINDS = {
    /** Placing, finding and seeing public geocaches; includes the 18+ statement. */
    'coalition-caches': {
        currentVersion: CACHE_DISCLOSURE.version,
        textSha256: sha256Hex(cacheDisclosureText()),
        requiresAge: true,
    },
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
    | {
          ok: false;
          reason:
              | 'unknown_kind'
              | 'stale_version'
              | 'age_required'
              | 'bad_text_hash'
              | 'wrong_text';
      };

export const recordConsent = (
    userId: string,
    input: { kind: string; version: number; textSha256: string; ageConfirmed: boolean }
): RecordConsentResult => {
    if (!isConsentKind(input.kind)) return { ok: false, reason: 'unknown_kind' };
    const spec = CONSENT_KINDS[input.kind];
    if (input.version !== spec.currentVersion) return { ok: false, reason: 'stale_version' };
    if (spec.requiresAge && !input.ageConfirmed) return { ok: false, reason: 'age_required' };
    if (!SHA256_HEX.test(input.textSha256)) return { ok: false, reason: 'bad_text_hash' };
    if (input.textSha256 !== spec.textSha256) return { ok: false, reason: 'wrong_text' };

    const now = new Date().toISOString();
    // A new agreement replaces every earlier one of the same kind, which stays
    // in the history as withdrawn at the moment it was replaced.
    withdrawAllActive(userId, input.kind, now);
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

/**
 * Mark every active agreement of this kind withdrawn. Normally there is one;
 * two writers racing could leave two, and a withdrawal must end them all.
 */
const withdrawAllActive = (userId: string, kind: ConsentKind, at: string): UserConsentRecord[] =>
    db
        .listUserConsents(userId)
        .filter((c) => c.kind === kind && c.withdrawnAt === null)
        .map((c) => db.withdrawUserConsent(c.id, at))
        .filter((c): c is UserConsentRecord => c !== undefined);

/** Withdraw the person's active agreements of this kind; the newest is returned. Undefined when there is none. */
export const withdrawConsent = (
    userId: string,
    kind: ConsentKind
): UserConsentRecord | undefined => {
    return withdrawAllActive(userId, kind, new Date().toISOString())[0];
};
