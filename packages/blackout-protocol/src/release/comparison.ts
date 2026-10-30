/**
 * When a safety-code comparison still counts (the independent review's H1,
 * `docs/security/release-identities-2026-10-26.md` §2 and §5 item 8, and
 * `docs/security/release-envelope-2026-10-26.md` §9).
 *
 * A comparison is about two particular identities. Identity v1 carries no
 * time or sequence number, so a device cannot order an account's identities
 * by themselves, and a server can serve an old one as current. A comparison
 * therefore counts only while the identity it names is the account's
 * current one, is not listed as replaced, and the device has seen no other
 * identity served as that account's current one since comparing. When
 * sealing, the owner's own identity must also still be the one the
 * comparison was made with: the recipient's device compared that key, and
 * will count a release signed by another one as unconfirmed. When judging a
 * release in hand, the key that signed it must be the one compared: a
 * comparison that counts says nothing about a release signed by another key
 * (the independent review of the envelope, P3-M1).
 *
 * Every fingerprint here is one the device computed from an identity it
 * verified, never one a server stated.
 */

import { RELEASE_IDENTITY_STORAGE_LIMIT } from './contracts';
import { verifyReleaseIdentity } from './identity';
import type { ReleaseComparison } from './recoveryFile';

/**
 * `current`: the comparison counts, and if a release is in hand it was
 * signed by the key compared. `other_key`: the release in hand was signed by
 * a key that is not the one compared, whatever the comparison's state, once
 * there is one. `stale`: compare again. `none`: never compared, whatever
 * signed the release; it is answered before any other rule.
 */
export type ReleaseComparisonState = 'current' | 'other_key' | 'stale' | 'none';

export type ReleaseComparisonStateInput = {
    /** This device's comparison with the account, if it has one. */
    comparison: ReleaseComparison | null | undefined;
    /** The fingerprint of the account's current identity as the directory serves it now, or null. */
    currentFingerprint: string | null;
    /** The fingerprints of the identities the directory lists as replaced. */
    supersededFingerprints: readonly string[];
    /** Fingerprints this device has seen served as the account's current identity since comparing. */
    seenSinceComparison?: readonly string[];
    /** When sealing: this device's own current fingerprint, which must be the one compared. */
    ownFingerprint?: string;
    /**
     * Which of the two uses this is, written out. When judging a release in
     * hand: the fingerprint that signed it, the `ownerFingerprint` of an `ok`
     * `ReleaseOpenResult` (computed from the identity that verified), a
     * string, which must be the one compared or the state is `other_key`.
     * When sealing, where no release is in hand: `null`, and the signer rule
     * is not applied. The field is required so that a caller judging a
     * release cannot leave it out by accident and get `current` for a release
     * another key signed (the envelope review's fourth reading); anything
     * that is neither `null` nor the compared fingerprint, a failed open's
     * absent signer forced through a cast included, is `other_key`.
     */
    signerFingerprint: string | null;
};

/**
 * Whether a comparison counts now, and, given the signer of a release in
 * hand, whether that release was signed by the key compared: `current` only
 * when both hold. With no comparison the answer is `none`, before the signer
 * or anything else is looked at. This is the one function that decides
 * whether a screen may say "signed with a key you compared".
 */
export const releaseComparisonState = (
    input: ReleaseComparisonStateInput
): ReleaseComparisonState => {
    const comparison = input.comparison;
    if (!comparison) return 'none';
    if (input.signerFingerprint !== null && input.signerFingerprint !== comparison.fingerprint) {
        return 'other_key';
    }
    if (input.ownFingerprint !== undefined && input.ownFingerprint !== comparison.ownFingerprint) {
        return 'stale';
    }
    if (input.currentFingerprint !== comparison.fingerprint) return 'stale';
    if (input.supersededFingerprints.includes(comparison.fingerprint)) return 'stale';
    if ((input.seenSinceComparison ?? []).some((seen) => seen !== comparison.fingerprint)) {
        return 'stale';
    }
    return 'current';
};

export type ReleaseDirectoryFingerprints = {
    /** The current identity's fingerprint, or null if there is none or it fails its check. */
    current: string | null;
    /** The fingerprints of the replaced identities that pass their check. */
    superseded: string[];
};

/** A plain object: not null, not an array. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const nothing = (): ReleaseDirectoryFingerprints => ({ current: null, superseded: [] });

/**
 * The fingerprints of a directory entry's identities, each computed from an
 * identity that passed `verifyReleaseIdentity` for `accountId`. The entry is
 * the server's answer, whatever it is: an entry that is not an object, is
 * for another account or whose `superseded` is not an array counts as
 * nothing, as does an identity that fails its check (a malformed answer is a
 * refusal, never a thrown `TypeError`). So does an entry listing more
 * replaced identities than the API keeps for one account in all
 * (`RELEASE_IDENTITY_STORAGE_LIMIT`), refused before any of them is
 * verified: each costs a signature check and two key checks, and an honest
 * server cannot serve more (the envelope review's fourth reading).
 */
export const releaseDirectoryFingerprints = async (
    entry: unknown,
    accountId: string
): Promise<ReleaseDirectoryFingerprints> => {
    if (!isRecord(entry) || entry.accountId !== accountId) return nothing();
    const replaced: unknown = entry.superseded;
    if (!Array.isArray(replaced) || replaced.length > RELEASE_IDENTITY_STORAGE_LIMIT) {
        return nothing();
    }
    let current: string | null = null;
    if (isRecord(entry.current)) {
        const check = await verifyReleaseIdentity(entry.current.identity, { accountId });
        current = check.ok ? check.fingerprint : null;
    }
    const superseded: string[] = [];
    for (const listed of replaced as unknown[]) {
        const identity = isRecord(listed) ? listed.identity : undefined;
        const check = await verifyReleaseIdentity(identity, { accountId });
        if (check.ok) superseded.push(check.fingerprint);
    }
    return { current, superseded };
};
