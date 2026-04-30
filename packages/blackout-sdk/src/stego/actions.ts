import type {
    StegoCarrier,
    StegoChannelCreatedEvent,
    StegoChannelCreatedPayload,
    StegoChannelExpiredEvent,
    StegoChannelExpiryReason,
    StegoChannelRotatedEvent,
    StegoEphemeralMode,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

/**
 * Snapshot of a stego channel as returned by the canonical lifecycle API.
 * Mirrors `StegoChannelCreatedPayload` and adds the rotation/expiry bookkeeping
 * needed by the canonical client to render lifecycle state without replaying
 * the event log.
 */
export type StegoChannelSnapshot = StegoChannelCreatedPayload & {
    /** Last rotation index applied (0 if never rotated). */
    rotationIndex: number;
    /** ISO-8601 timestamp of the most recent rotation, if any. */
    lastRotatedAt?: string;
    /** ISO-8601 timestamp the channel expired, if any. */
    expiredAt?: string;
    /** Why the channel expired, if any. */
    expiryReason?: StegoChannelExpiryReason;
};

export type StegoChannelListResponse = {
    /** Subject the channels belong to (typically the authenticated subject). */
    subject: string;
    channels: StegoChannelSnapshot[];
};

export type CreateStegoChannelInput = {
    name: string;
    audience: string;
    carrier: StegoCarrier;
    ephemeralMode: StegoEphemeralMode;
    rotationDays: number;
    /** Required when `ephemeralMode === 'expire_after_hours'`. */
    ttlHours?: number;
    /**
     * Required by the server but never echoed back. Callers MUST treat this
     * as sensitive material and avoid persisting it client-side beyond the
     * duration of the request.
     */
    passphrase: string;
};

export type RotateStegoChannelInput = {
    /**
     * New material the rotation will derive its fingerprint from. Like
     * `passphrase` on create, this MUST NOT be retained client-side.
     */
    passphrase: string;
    /** Optional ISO-8601 override; defaults server-side to `now`. */
    rotatedAt?: string;
};

export const createStegoActions = (client: ApiClient) => ({
    /**
     * Fetch the current set of stego channels for the authenticated subject.
     * Backed by `GET /v1/stego/channels`. Returns the full set so the
     * canonical client can replace its local snapshot atomically.
     */
    listChannels: () =>
        client<StegoChannelListResponse>({
            method: 'GET',
            path: '/v1/stego/channels',
        }),
    /**
     * Create a stego channel. The server emits a
     * `blackout.stego.channel.created` envelope and returns the channel
     * snapshot for hydration.
     */
    createChannel: (input: CreateStegoChannelInput) =>
        client<StegoChannelCreatedEvent>({
            method: 'POST',
            path: '/v1/stego/channels',
            body: input,
        }),
    /**
     * Rotate the channel's material. The server emits a
     * `blackout.stego.channel.rotated` envelope; receivers should drop any
     * cached material with a stale fingerprint.
     */
    rotateChannel: (channelId: string, input: RotateStegoChannelInput) =>
        client<StegoChannelRotatedEvent>({
            method: 'POST',
            path: `/v1/stego/channels/${encodeURIComponent(channelId)}/rotate`,
            body: input,
        }),
    /**
     * Expire (revoke) a channel. The server emits a
     * `blackout.stego.channel.expired` envelope with `reason` set to the
     * supplied value; defaults to `operator_revoked`.
     */
    expireChannel: (
        channelId: string,
        options: { reason?: StegoChannelExpiryReason } = {}
    ) =>
        client<StegoChannelExpiredEvent>({
            method: 'DELETE',
            path: `/v1/stego/channels/${encodeURIComponent(channelId)}`,
            body: { reason: options.reason ?? 'operator_revoked' },
        }),
    /**
     * Fetch a single channel snapshot. Used by deep-link surfaces that
     * arrive without the full list in cache.
     */
    fetchChannel: (channelId: string) =>
        client<StegoChannelSnapshot>({
            method: 'GET',
            path: `/v1/stego/channels/${encodeURIComponent(channelId)}`,
        }),
});

/**
 * Pure helper: derives the next expiry timestamp for a channel given its
 * ephemeral mode and the time of the most recent material event (creation
 * or rotation). Mirrors the rotation/expiry math the legacy
 * `apps/blackout-web` shell drives off `StegoChannel.updatedAt`.
 *
 * Returns `null` when the channel never auto-expires (`persistent` /
 * `delete_on_read`), or when `ttlHours` is missing/<=0 for `expire_after_hours`.
 */
export const computeStegoExpiryAt = (
    channel: Pick<StegoChannelSnapshot, 'ephemeralMode' | 'ttlHours' | 'createdAt' | 'lastRotatedAt'>
): string | null => {
    if (channel.ephemeralMode !== 'expire_after_hours') return null;
    const ttlHours = channel.ttlHours;
    if (typeof ttlHours !== 'number' || ttlHours <= 0) return null;
    const anchorIso = channel.lastRotatedAt ?? channel.createdAt;
    const anchorMs = new Date(anchorIso).getTime();
    if (Number.isNaN(anchorMs)) return null;
    return new Date(anchorMs + ttlHours * 3_600_000).toISOString();
};

/**
 * Normalize a free-form channel name into a stable id matching the legacy
 * `apps/blackout-web` `normalizeStegoChannelId` shape (`[a-z0-9-]+`,
 * collapsed runs, trimmed leading/trailing dashes). Surfaced so the
 * canonical client and the SDK both produce identical ids for the same
 * input string.
 */
export const normalizeStegoChannelId = (raw: string): string =>
    raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export type {
    StegoCarrier,
    StegoChannelCreatedEvent,
    StegoChannelCreatedPayload,
    StegoChannelExpiredEvent,
    StegoChannelExpiryReason,
    StegoChannelRotatedEvent,
    StegoEphemeralMode,
};
