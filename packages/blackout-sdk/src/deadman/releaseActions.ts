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
 * of them; every fingerprint is computed here from a verified identity, never
 * taken from the server.
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
    | 'not_a_release';

export class ReleaseActionError extends Error {
    readonly code: ReleaseActionErrorCode;
    /** The recipient the refusal is about, when there is one. */
    readonly accountId?: string;
    readonly state?: ReleaseComparisonState;

    constructor(
        code: ReleaseActionErrorCode,
        message: string,
        detail: { accountId?: string; state?: ReleaseComparisonState } = {}
    ) {
        super(message);
        this.code = code;
        this.accountId = detail.accountId;
        this.state = detail.state;
        this.name = 'ReleaseActionError';
    }
}

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
                "Blackout's server does not list this device's release key as yours."
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
                { accountId: recipient.accountId, state }
            );
        }
        return entry.current.identity;
    };

    return {
        /** Bounds for the arming form, and whether this deployment arms at all. */
        getLimits: () => client<DeadmanLimits>({ method: 'GET', path: '/v1/deadman/limits' }),

        /**
         * The releases given to the caller: fired release switches that name
         * them, each with the caller's own copy only. Open one with
         * `openReleaseCopy`, then judge its owner's key with
         * `releaseComparisonState` before saying who sent it.
         */
        listReleases: () =>
            client<DeadmanReleasesResponse>({ method: 'GET', path: '/v1/deadman/releases' }),

        /**
         * Arm a release switch: check the owner's key and every recipient's
         * comparison, seal the message on this device, and send only the
         * envelope, the timer and the label. The message and the content key
         * never leave the device.
         */
        armReleaseSwitch: async (input: ArmReleaseSwitchInput) => {
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
            return client<DeadmanSwitchArmedEvent>({
                method: 'POST',
                path: '/v1/deadman/switches',
                body,
            });
        },

        /**
         * Seal a release's content key again to one recipient's new identity,
         * after a new comparison. The key comes from the owner's own copy,
         * opened and checked on this device; the server gets only the new copy.
         */
        resealRecipient: async (switchId: string, input: ResealRecipientInput) => {
            const owned = await client<DeadmanSwitchPayload>({
                method: 'GET',
                path: `/v1/deadman/switches/${encodeURIComponent(switchId)}`,
            });
            if (!owned.release) {
                throw new ReleaseActionError(
                    'not_a_release',
                    'This switch holds no release to re-seal.'
                );
            }
            await checkOwnerKey(input.ownerKeySet);
            const identity = await recipientIdentity(
                input.recipient,
                input.ownerKeySet.fingerprint
            );
            const copy = await resealReleaseCopy({
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
