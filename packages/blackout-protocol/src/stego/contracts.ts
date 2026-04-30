/**
 * Steganography channel + ephemeral lifecycle contracts (BKL-005).
 *
 * Mirrors the `StegoChannel` shape that apps/blackout-web ships in
 * `src/app.ts` and the `StegoEnterprisePolicyState` lifecycle managed by
 * `apps/blackout-client/src/app/features/steganography/stegoPolicyLifecycle.ts`,
 * lifted into a typed protocol so canonical and legacy hosts agree on the
 * wire shape for create/rotate/expire flows.
 */

import type { EventEnvelope } from '../common/types';

export const STEGO_PROTOCOL_VERSION = 1 as const;

export const STEGO_EVENT_NAMES = {
    channelCreated: 'co.bmc.stego.channel.created',
    channelRotated: 'co.bmc.stego.channel.rotated',
    channelExpired: 'co.bmc.stego.channel.expired',
} as const;

export type StegoEventName = (typeof STEGO_EVENT_NAMES)[keyof typeof STEGO_EVENT_NAMES];

/**
 * Stego carrier types supported across both the baseline (text) and the
 * enterprise (image/audio) flows. Receivers should ignore unknown carriers
 * defensively rather than throwing.
 */
export type StegoCarrier = 'text' | 'image' | 'audio';

/**
 * Ephemeral lifecycle modes. Mirrors `StegoEphemeralMode` from the
 * canonical client policy reducer.
 *
 * - `persistent`        — channel never auto-expires.
 * - `expire_after_hours` — channel auto-expires after `ttlHours` from
 *                          `createdAt` (or `lastRotatedAt`, if rotated).
 * - `delete_on_read`    — channel expires after first successful decode.
 */
export type StegoEphemeralMode = 'persistent' | 'expire_after_hours' | 'delete_on_read';

export interface StegoChannelCreatedPayload {
    /** Stable channel id (server-issued; clients should treat opaquely). */
    channelId: string;
    /** Human-friendly channel name (matches legacy `StegoChannel.name`). */
    name: string;
    /** Audience descriptor — free-form tag the producer chose at create time. */
    audience: string;
    /** Carrier the channel will encode into. */
    carrier: StegoCarrier;
    /** Ephemeral lifecycle mode applied to messages on this channel. */
    ephemeralMode: StegoEphemeralMode;
    /** TTL in hours when `ephemeralMode === 'expire_after_hours'`; ignored otherwise. */
    ttlHours?: number;
    /** Rotation cadence in days. 0 disables scheduled rotation. */
    rotationDays: number;
    /** ISO-8601 timestamp the channel was created. */
    createdAt: string;
}

export interface StegoChannelRotatedPayload {
    /** Channel being rotated. */
    channelId: string;
    /** ISO-8601 timestamp of the rotation event. */
    rotatedAt: string;
    /** Monotonic rotation counter (1, 2, 3, …) for ordering / replay. */
    rotationIndex: number;
    /**
     * Opaque material fingerprint (e.g. derived passphrase/key digest). Servers
     * must NEVER ship plaintext key material; this field is for the client to
     * detect drift between sessions, not to recover the key.
     */
    materialFingerprint: string;
}

/**
 * Reason the channel expired. Kept narrow so the canonical client can render
 * actionable guidance without parsing free-form strings.
 */
export type StegoChannelExpiryReason =
    | 'ttl_elapsed'
    | 'read_consumed'
    | 'operator_revoked'
    | 'policy_archived';

export interface StegoChannelExpiredPayload {
    /** Channel that expired. */
    channelId: string;
    /** ISO-8601 timestamp the expiry took effect. */
    expiredAt: string;
    /** Why the channel expired. */
    reason: StegoChannelExpiryReason;
}

export type StegoChannelCreatedEvent = EventEnvelope<
    'blackout.stego.channel.created',
    StegoChannelCreatedPayload
>;

export type StegoChannelRotatedEvent = EventEnvelope<
    'blackout.stego.channel.rotated',
    StegoChannelRotatedPayload
>;

export type StegoChannelExpiredEvent = EventEnvelope<
    'blackout.stego.channel.expired',
    StegoChannelExpiredPayload
>;
