/**
 * The dead-man release, as the API and its clients exchange it: arming in
 * the release format, re-sealing a recipient's copy, the copies released to
 * a recipient, the notice the bot posts, and the limits the arming form
 * shows. The envelope itself is `release/envelope.ts`; format and reasons:
 * `docs/security/release-envelope-2026-10-26.md`.
 *
 *   POST /v1/deadman/switches                 arm (`DeadmanReleaseArmRequest`)
 *   POST /v1/deadman/switches/:id/reseal      re-seal one recipient's copy
 *   GET  /v1/deadman/releases                 the copies released to the caller
 *   GET  /v1/deadman/limits                   bounds for the arming form
 *
 * Arming answers 409 `arming_unavailable` while the API's
 * `BLACKOUT_DEADMAN_RELEASES` is off, which it is unless an operator turns it
 * on. Everything a response holds is the server's word: a client opens a
 * release with `openReleaseCopy` and judges the owner's key with
 * `releaseComparisonState`.
 */

import type { ReleaseIdentity } from '../release/identity';
import {
    RELEASE_ID_PATTERN,
    type ReleaseCopy,
    type ReleaseEnvelope,
    type ReleaseHeader,
} from '../release/envelope';

/** Switches armed before the release format, and switches armed in it. */
export const DEADMAN_RELEASE_FORMAT = 'release-v1' as const;
export type DeadmanReleaseFormat = 'legacy' | typeof DEADMAN_RELEASE_FORMAT;

/** The only body `POST /v1/deadman/switches` takes. */
export type DeadmanReleaseArmRequest = {
    format: typeof DEADMAN_RELEASE_FORMAT;
    checkInIntervalSeconds: number;
    gracePeriodSeconds: number;
    /** Shown to the owner only; the server can read it. */
    label?: string;
    envelope: ReleaseEnvelope;
};

/** `POST /v1/deadman/switches/:id/reseal`: one recipient's new copy. */
export type DeadmanReleaseResealRequest = {
    copy: ReleaseCopy;
};

/** One release, as its recipient is given it once the switch has fired. */
export type DeadmanReleasedCopy = {
    /** The release id, which is also the switch's id. */
    releaseId: string;
    ownerAccountId: string;
    /** When the switch fired. */
    releasedAt: string;
    /** When the API removes the content and the copies. */
    removesAt: string;
    header: ReleaseHeader;
    /** The owner's identity as it was at arming: verify it, then compare. */
    ownerIdentity: ReleaseIdentity;
    /** The caller's own copy, never anyone else's. */
    copy: ReleaseCopy;
};

export type DeadmanReleasesResponse = { releases: DeadmanReleasedCopy[] };

/** What the owner's view adds for a release switch while its content is held. */
export type DeadmanOwnerRelease = {
    header: ReleaseHeader;
    ownerIdentity: ReleaseIdentity;
    /** The owner's own copy, which re-sealing opens. */
    ownCopy: ReleaseCopy;
    /** Whom each copy is sealed to, so a changed key shows. */
    sealedTo: Array<{ recipientAccountId: string; recipientFingerprint: string }>;
};

/** The owner's count of the notices one release sent. */
export type DeadmanNoticeCounts = {
    total: number;
    sent: number;
    pending: number;
    failed: number;
};

/** `GET /v1/deadman/limits`: what the arming form needs to say true things. */
export type DeadmanLimits = {
    /** Whether this deployment arms release switches (`BLACKOUT_DEADMAN_RELEASES`). */
    armingAvailable: boolean;
    checkInIntervalSeconds: { min: number; max: number };
    gracePeriodSeconds: { min: number; max: number };
    maxRecipients: number;
    maxMessageBytes: number;
    paddedSizes: number[];
    labelMaxLength: number;
    /** Live (armed or in grace) release switches one account may have. */
    maxLiveReleaseSwitches: number;
    /** How late a sweep may reach a switch before it is read as an outage. */
    backlogToleranceSeconds: number;
    /** The grace a switch reached that late gets from then. */
    backlogGraceSeconds: number;
    /** How long after a release its content is kept. */
    releaseRetentionDays: number;
    /** How long a notice is retried. */
    noticeRetryDays: number;
};

/** Days a released switch's content and copies are kept. */
export const DEADMAN_RELEASE_RETENTION_DAYS = 365;
/** Days the bot retries a notice before recording it as failed. */
export const DEADMAN_NOTICE_RETRY_DAYS = 30;
/** Live release switches per owner: a bound on storage. */
export const DEADMAN_MAX_LIVE_RELEASE_SWITCHES = 20;
/** The owner-only label's length, as before. */
export const DEADMAN_LABEL_MAX_LENGTH = 280;

/**
 * The notice's body, fixed: it is in room-list previews and, for anyone with
 * email notifications on, in an email, so it says nothing about anyone.
 */
export const DEADMAN_NOTICE_BODY =
    "There is something new for you in Blackout. Open Blackout to see it. This room is not end-to-end encrypted, so please don't reply here.";
/** The notice's pointer field: a schema version and the release id, nothing else. */
export const DEADMAN_NOTICE_POINTER_FIELD = 'co.bmc.deadman.release';
export const DEADMAN_NOTICE_SCHEMA_VERSION = 1;
/** The standing room the bot posts notices into, one per account. */
export const DEADMAN_NOTICE_ROOM_NAME = 'Blackout notices';

export type DeadmanNoticePointer = {
    schemaVersion: typeof DEADMAN_NOTICE_SCHEMA_VERSION;
    releaseId: string;
};

/**
 * The pointer a notice carries, or null when `value` is not exactly one. The
 * notice is read from an unencrypted room the homeserver controls, so the
 * release id it points with has to have a release id's form
 * (`RELEASE_ID_PATTERN`) before a client puts it anywhere (review, P3-L4).
 */
export const parseDeadmanNoticePointer = (value: unknown): DeadmanNoticePointer | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    const candidate = value as Partial<DeadmanNoticePointer>;
    if (
        keys.length !== 2 ||
        candidate.schemaVersion !== DEADMAN_NOTICE_SCHEMA_VERSION ||
        typeof candidate.releaseId !== 'string' ||
        !RELEASE_ID_PATTERN.test(candidate.releaseId)
    ) {
        return null;
    }
    return { schemaVersion: DEADMAN_NOTICE_SCHEMA_VERSION, releaseId: candidate.releaseId };
};

/** Error codes the release routes answer with. */
export const DEADMAN_RELEASE_ERRORS = {
    /** 409: arming is closed on this deployment. */
    armingUnavailable: 'arming_unavailable',
    /** 400: the envelope failed `parseReleaseEnvelope`; `reason` says how. */
    invalidEnvelope: 'invalid_release_envelope',
    /** 403: the envelope names another owner than the caller. */
    notYours: 'release_not_yours',
    /** 409: the caller has no published release identity. */
    ownerIdentityMissing: 'owner_identity_missing',
    /** 409: the header names an owner identity that is not the caller's current one. */
    ownerIdentityChanged: 'owner_identity_changed',
    /** 400: a copy names an account that does not exist here, or has no release identity. */
    unknownRecipient: 'unknown_recipient',
    /** 409: a copy names an identity its account has replaced; `recipientAccountId` says whose. */
    recipientIdentitySuperseded: 'recipient_identity_superseded',
    /** 400: a copy names an identity its account never published. */
    recipientIdentityUnknown: 'recipient_identity_unknown',
    /** 400: a copy's signature does not verify under the owner's identity. */
    invalidSignature: 'invalid_release_signature',
    /** 409: the release id is already a switch's. */
    releaseIdTaken: 'release_id_taken',
    /** 409: the owner has as many live release switches as are allowed. */
    liveLimit: 'release_switch_limit',
    /** 409: re-sealing a switch that is not in the release format. */
    notARelease: 'not_a_release',
    /** 400: re-sealing for an account the switch does not name. */
    notARecipient: 'not_a_recipient',
} as const;
