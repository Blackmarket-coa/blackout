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

import type { ReleaseIdentityDirectoryEntry } from './contracts';
import { verifyReleaseIdentity } from './identity';
import type { ReleaseComparison } from './recoveryFile';

/**
 * `current`: the comparison counts, and if a signer was given it is the key
 * compared. `other_key`: the release in hand was signed by a key that is not
 * the one compared, whatever the comparison's state. `stale`: compare again.
 * `none`: never compared.
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
     * When judging a release in hand: the fingerprint that signed it
     * (`ReleaseOpenResult.ownerFingerprint`, computed from the identity that
     * verified). It must be the one compared, or the state is `other_key`.
     */
    signerFingerprint?: string;
};

/**
 * Whether a comparison counts now, and, given the signer of a release in
 * hand, whether that release was signed by the key compared: `current` only
 * when both hold. This is the one function that decides whether a screen may
 * say "signed with a key you compared".
 */
export const releaseComparisonState = (
    input: ReleaseComparisonStateInput
): ReleaseComparisonState => {
    const comparison = input.comparison;
    if (!comparison) return 'none';
    if (
        input.signerFingerprint !== undefined &&
        input.signerFingerprint !== comparison.fingerprint
    ) {
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

/**
 * The fingerprints of a directory entry's identities, each computed from an
 * identity that passed `verifyReleaseIdentity` for `accountId`. An entry for
 * another account, and an identity that fails its check, count as nothing.
 */
export const releaseDirectoryFingerprints = async (
    entry: ReleaseIdentityDirectoryEntry,
    accountId: string
): Promise<ReleaseDirectoryFingerprints> => {
    if (entry.accountId !== accountId) return { current: null, superseded: [] };
    let current: string | null = null;
    if (entry.current) {
        const check = await verifyReleaseIdentity(entry.current.identity, { accountId });
        current = check.ok ? check.fingerprint : null;
    }
    const superseded: string[] = [];
    for (const replaced of entry.superseded) {
        const check = await verifyReleaseIdentity(replaced.identity, { accountId });
        if (check.ok) superseded.push(check.fingerprint);
    }
    return { current, superseded };
};
