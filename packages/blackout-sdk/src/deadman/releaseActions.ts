import {
    DEADMAN_RELEASE_FORMAT,
    buildReleaseEnvelope,
    releaseComparisonState,
    releaseDirectoryFingerprints,
    resealReleaseCopy,
    type DeadmanLimits,
    type DeadmanReleaseArmRequest,
    type DeadmanReleaseResealRequest,
    type DeadmanReleasesResponse,
    type DeadmanSwitchArmedEvent,
    type DeadmanSwitchPayload,
    type ReleaseComparison,
    type ReleaseComparisonState,
    type ReleaseIdentity,
    type ReleaseKeySet,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';
import { BlackoutSdkError } from '../errors/sdkError';
import { createReleaseIdentityActions } from '../release/actions';

/**
 * Dead-man releases (`docs/security/release-envelope-2026-10-26.md`): arm a
 * switch whose message is sealed on this device, re-seal a recipient's copy
 * after their key changed, list what was released to the caller, and read
 * the limits the arming form shows.
 *
 * Arming and re-sealing refuse a recipient unless this device's comparison
 * with them counts now (`releaseComparisonState`, the independent review's
 * H1): their identity in the directory is the one compared, is not listed as
 * replaced, nothing newer was seen since, and the owner's own key is still
 * the one the comparison was made with. The directory is read fresh for each
 * of them, before the envelope or the copy is sent (so the server learns whom
 * the owner is about to name, C14); every fingerprint is computed here from a
 * verified identity, never taken from the server.
 *
 * What this device observes here is the client's to record (the envelope
 * review, P3-M3): a refusal for a key the directory serves carries that key's
 * computed fingerprint (`ReleaseActionError.servedFingerprint`), and a
 * successful arming returns whom the envelope was sealed to. Those feed
 * `seenSinceComparison`, the third clause of H1, from the very reads that
 * decide what is sealed. Re-sealing is bound to the switch the owner is
 * acting on (P3-H1): the owner's view must be that switch's, and the header
 * it carries that release's.
 */

/** One person to seal to, as this device knows them. */
export type ReleaseRecipientInput = {
    accountId: string;
    /** This device's comparison with them; without one they cannot be named. */
    comparison: ReleaseComparison | null | undefined;
    /** Fingerprints this device has seen served as their current identity since comparing. */
    seenSinceComparison?: readonly string[];
};

export type ArmReleaseSwitchInput = {
    /** The owner's current key set on this device. */
    ownerKeySet: ReleaseKeySet;
    recipients: readonly ReleaseRecipientInput[];
    message: string;
    checkInIntervalSeconds: number;
    gracePeriodSeconds: number;
    /** Shown to the owner only; the server can read it. */
    label?: string;
};

export type ResealRecipientInput = {
    ownerKeySet: ReleaseKeySet;
    recipient: ReleaseRecipientInput;
};

/** One identity the envelope was sealed to, as the device built it. */
export type ReleaseSealedTo = {
    accountId: string;
    /** The fingerprint of that account's identity, computed here from the identity sealed to. */
    fingerprint: string;
};

/**
 * What arming returns: the server's armed event, and, from the envelope this
 * device built, the release id and whom it was sealed to (the owner's own
 * identity first, then each recipient), so the client can keep its own
 * record of each release's recipients, from a source it made.
 */
export type ArmReleaseSwitchResult = {
    armed: DeadmanSwitchArmedEvent;
    releaseId: string;
    sealedTo: ReleaseSealedTo[];
};

export type ReleaseActionErrorCode =
    /** The owner has no release identity in the directory. */
    | 'owner_key_not_published'
    /** The directory's current identity for the owner is not this device's key set. */
    | 'owner_key_not_current'
    /** A recipient has no release identity in the directory. */
    | 'recipient_identity'
    /** A recipient's comparison does not count now (`state` says whether stale or missing). */
    | 'recipient_comparison'
    /** The switch to re-seal is not a release switch whose content is held. */
    | 'not_a_release'
    /** The owner's view served for a switch is not that switch, or its header not that release. */
    | 'release_mismatch'
    /**
     * The release list is not a list, an entry in it is not an object with a
     * signed header carrying both ids, or its unsigned top-level fields
     * differ from its header's.
     */
    | 'server_mismatch';

export class ReleaseActionError extends Error {
    readonly code: ReleaseActionErrorCode;
    /** The recipient the refusal is about, when there is one. */
    readonly accountId?: string;
    readonly state?: ReleaseComparisonState;
    /**
     * On `recipient_comparison` and `owner_key_not_current`: the fingerprint
     * of the identity the directory served as that account's current one,
     * computed here from the served identity, or null when it served none
     * that verified. The client records it as seen (H1's third clause).
     */
    readonly servedFingerprint?: string | null;

    constructor(
        code: ReleaseActionErrorCode,
        message: string,
        detail: {
            accountId?: string;
            state?: ReleaseComparisonState;
            servedFingerprint?: string | null;
        } = {}
    ) {
        super(message);
        this.code = code;
        this.accountId = detail.accountId;
        this.state = detail.state;
        this.servedFingerprint = detail.servedFingerprint;
        this.name = 'ReleaseActionError';
    }
}

/** A plain object: not null, not an array. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a released entry is one at all, and describes itself as its signed
 * header does: an object whose `header` is an object carrying a string
 * `releaseId` and a string `ownerAccountId`, each repeated by the entry's
 * top-level field of that name. Two absent ids are not an agreement: `null`,
 * `{}`, a string, and an entry with no ids on either side are refused, not
 * passed on as releases (the envelope review's second reading of P3-M2).
 */
const releasedEntryIsConsistent = (entry: unknown): boolean => {
    if (!isRecord(entry) || !isRecord(entry.header)) return false;
    const { releaseId, ownerAccountId } = entry.header;
    return (
        typeof releaseId === 'string' &&
        typeof ownerAccountId === 'string' &&
        releaseId === entry.releaseId &&
        ownerAccountId === entry.ownerAccountId
    );
};

const isNotFound = (cause: unknown): boolean =>
    cause instanceof BlackoutSdkError && cause.status === 404;

export const createDeadmanReleaseActions = (client: ApiClient) => {
    const identities = createReleaseIdentityActions(client);

    /** The owner's key set, refused unless the directory serves it as the owner's current identity. */
    const checkOwnerKey = async (ownerKeySet: ReleaseKeySet): Promise<void> => {
        const accountId = ownerKeySet.identity.accountId;
        const mine = await identities.getMine();
        if (!mine.current) {
            throw new ReleaseActionError(
                'owner_key_not_published',
                'Your release keys are not published, so nobody could check what you sign.'
            );
        }
        const served = await releaseDirectoryFingerprints(mine, accountId);
        if (served.current !== ownerKeySet.fingerprint) {
            throw new ReleaseActionError(
                'owner_key_not_current',
                "Blackout's server does not list this device's release key as yours.",
                { accountId, servedFingerprint: served.current }
            );
        }
    };

    /** The identity to seal to, if this device's comparison with the person counts now. */
    const recipientIdentity = async (
        recipient: ReleaseRecipientInput,
        ownFingerprint: string
    ): Promise<ReleaseIdentity> => {
        let entry;
        try {
            entry = await identities.getForAccount(recipient.accountId);
        } catch (cause) {
            if (isNotFound(cause)) {
                throw new ReleaseActionError(
                    'recipient_identity',
                    'This person has no release keys on this server.',
                    { accountId: recipient.accountId }
                );
            }
            throw cause;
        }
        const served = await releaseDirectoryFingerprints(entry, recipient.accountId);
        const state = releaseComparisonState({
            comparison: recipient.comparison,
            currentFingerprint: served.current,
            supersededFingerprints: served.superseded,
            seenSinceComparison: recipient.seenSinceComparison,
            ownFingerprint,
        });
        if (state !== 'current' || !entry.current) {
            throw new ReleaseActionError(
                'recipient_comparison',
                state === 'none'
                    ? 'Compare a safety code with this person first.'
                    : 'A release key changed since you compared codes with this person. Compare a new code first.',
                { accountId: recipient.accountId, state, servedFingerprint: served.current }
            );
        }
        return entry.current.identity;
    };

    return {
        /** Bounds for the arming form, and whether this deployment arms at all. */
        getLimits: () => client<DeadmanLimits>({ method: 'GET', path: '/v1/deadman/limits' }),

        /**
         * The releases given to the caller: fired release switches that name
         * them, each with the caller's own copy only. Each entry's top-level
         * `releaseId` and `ownerAccountId` are the server's unsigned duplicates
         * of the signed header's; an entry that is not an object with a header
         * carrying both as strings, or where they differ, is refused
         * (`server_mismatch`), and a screen shows only what `openReleaseCopy`
         * returns from the header, never the duplicates (P3-M2). Open one with
         * `openReleaseCopy`; then, before saying who sent it, call
         * `releaseComparisonState` with the result's `ownerFingerprint` as
         * `signerFingerprint`: `current` means both that the key which signed
         * the release is the one compared and that the comparison counts now,
         * and only then may a screen say "signed with a key you compared"
         * (P3-M1). That one function decides; `other_key` means another key
         * signed it, `stale` that the comparison must be made again.
         */
        listReleases: async (): Promise<DeadmanReleasesResponse> => {
            const response = await client<DeadmanReleasesResponse>({
                method: 'GET',
                path: '/v1/deadman/releases',
            });
            const releases: unknown = response?.releases;
            if (!Array.isArray(releases)) {
                throw new ReleaseActionError(
                    'server_mismatch',
                    "Blackout's server did not answer with a list of releases."
                );
            }
            for (const entry of releases as unknown[]) {
                if (!releasedEntryIsConsistent(entry)) {
                    throw new ReleaseActionError(
                        'server_mismatch',
                        "Blackout's server listed a release without a signed header, or described it differently from its header."
                    );
                }
            }
            return response;
        },

        /**
         * Arm a release switch: check the owner's key and every recipient's
         * comparison, seal the message on this device, and send only the
         * envelope, the timer and the label. The message and the content key
         * never leave the device. Returns the armed event with the release id
         * and whom the envelope was sealed to, from the envelope built here.
         */
        armReleaseSwitch: async (input: ArmReleaseSwitchInput): Promise<ArmReleaseSwitchResult> => {
            await checkOwnerKey(input.ownerKeySet);
            const recipients: ReleaseIdentity[] = [];
            for (const recipient of input.recipients) {
                recipients.push(await recipientIdentity(recipient, input.ownerKeySet.fingerprint));
            }
            const envelope = await buildReleaseEnvelope({
                ownerKeySet: input.ownerKeySet,
                recipients,
                message: input.message,
            });
            const body: DeadmanReleaseArmRequest = {
                format: DEADMAN_RELEASE_FORMAT,
                checkInIntervalSeconds: input.checkInIntervalSeconds,
                gracePeriodSeconds: input.gracePeriodSeconds,
                ...(input.label === undefined ? {} : { label: input.label }),
                envelope,
            };
            const armed = await client<DeadmanSwitchArmedEvent>({
                method: 'POST',
                path: '/v1/deadman/switches',
                body,
            });
            return {
                armed,
                releaseId: envelope.releaseId,
                sealedTo: envelope.copies.map((copy) => ({
                    accountId: copy.recipientAccountId,
                    fingerprint: copy.recipientFingerprint,
                })),
            };
        },

        /**
         * Seal a release's content key again to one recipient's new identity,
         * after a new comparison. The key comes from the owner's own copy,
         * opened and checked on this device; the server gets only the new copy.
         * The owner's view the server answers with must be `switchId`'s, and
         * the header it carries that release's (P3-H1): otherwise a server
         * could have this device seal another release's key to this recipient.
         */
        resealRecipient: async (switchId: string, input: ResealRecipientInput) => {
            const owned = await client<DeadmanSwitchPayload>({
                method: 'GET',
                path: `/v1/deadman/switches/${encodeURIComponent(switchId)}`,
            });
            if (!owned?.release) {
                throw new ReleaseActionError(
                    'not_a_release',
                    'This switch holds no release to re-seal.'
                );
            }
            if (
                owned.switchId !== switchId ||
                !isRecord(owned.release.header) ||
                owned.release.header.releaseId !== switchId
            ) {
                throw new ReleaseActionError(
                    'release_mismatch',
                    "Blackout's server answered for another switch than the one being re-sealed."
                );
            }
            await checkOwnerKey(input.ownerKeySet);
            const identity = await recipientIdentity(
                input.recipient,
                input.ownerKeySet.fingerprint
            );
            const copy = await resealReleaseCopy({
                releaseId: switchId,
                header: owned.release.header,
                ownCopy: owned.release.ownCopy,
                ownerKeySet: input.ownerKeySet,
                recipient: identity,
            });
            const body: DeadmanReleaseResealRequest = { copy };
            return client<DeadmanSwitchPayload>({
                method: 'POST',
                path: `/v1/deadman/switches/${encodeURIComponent(switchId)}/reseal`,
                body,
            });
        },
    };
};

export type DeadmanReleaseActions = ReturnType<typeof createDeadmanReleaseActions>;

export type { DeadmanLimits, DeadmanReleasesResponse };
