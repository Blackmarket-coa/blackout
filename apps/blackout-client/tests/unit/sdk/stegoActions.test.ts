import { describe, expect, it } from 'vitest';
import {
    isStegoChannelCreated,
    isStegoChannelExpired,
    isStegoChannelRotated,
    STEGO_EVENT_NAMES,
    type StegoChannelCreatedEvent,
    type StegoChannelExpiredEvent,
    type StegoChannelRotatedEvent,
} from '@blackout/protocol';
import {
    computeStegoExpiryAt,
    createStegoActions,
    normalizeStegoChannelId,
    type CreateStegoChannelInput,
    type StegoChannelSnapshot,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol stego event guards (BKL-005)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(STEGO_EVENT_NAMES.channelCreated).toBe('co.bmc.stego.channel.created');
        expect(STEGO_EVENT_NAMES.channelRotated).toBe('co.bmc.stego.channel.rotated');
        expect(STEGO_EVENT_NAMES.channelExpired).toBe('co.bmc.stego.channel.expired');
    });

    it('isStegoChannelCreated narrows valid envelopes and enforces unions', () => {
        const valid: StegoChannelCreatedEvent = {
            event: 'blackout.stego.channel.created',
            roomId: '!s:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                channelId: 'ch-1',
                name: 'broadcast',
                audience: 'general',
                carrier: 'image',
                ephemeralMode: 'expire_after_hours',
                ttlHours: 24,
                rotationDays: 14,
                createdAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isStegoChannelCreated(valid)).toBe(true);
        expect(isStegoChannelRotated(valid)).toBe(false);
        expect(isStegoChannelExpired(valid)).toBe(false);
        expect(
            isStegoChannelCreated({
                ...valid,
                payload: { ...valid.payload, carrier: 'not-a-carrier' },
            })
        ).toBe(false);
        expect(
            isStegoChannelCreated({
                ...valid,
                payload: { ...valid.payload, ephemeralMode: 'not-a-mode' },
            })
        ).toBe(false);
    });

    it('isStegoChannelRotated narrows valid envelopes', () => {
        const valid: StegoChannelRotatedEvent = {
            event: 'blackout.stego.channel.rotated',
            roomId: '!s:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                channelId: 'ch-1',
                rotatedAt: '2026-04-30T00:00:00.000Z',
                rotationIndex: 2,
                materialFingerprint: 'sha256:abc',
            },
        };
        expect(isStegoChannelRotated(valid)).toBe(true);
        expect(isStegoChannelRotated({ ...valid, payload: { channelId: 'x' } })).toBe(false);
    });

    it('isStegoChannelExpired narrows valid envelopes and enforces reason union', () => {
        const valid: StegoChannelExpiredEvent = {
            event: 'blackout.stego.channel.expired',
            roomId: '!s:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                channelId: 'ch-1',
                expiredAt: '2026-04-30T00:00:00.000Z',
                reason: 'ttl_elapsed',
            },
        };
        expect(isStegoChannelExpired(valid)).toBe(true);
        expect(
            isStegoChannelExpired({
                ...valid,
                payload: { ...valid.payload, reason: 'not-a-reason' },
            })
        ).toBe(false);
    });
});

describe('@blackout/sdk createStegoActions', () => {
    it('listChannels calls GET /v1/stego/channels', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', channels: [] });
        const actions = createStegoActions(apiClient);
        await actions.listChannels();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/stego/channels' });
    });

    it('createChannel POSTs the input body verbatim', async () => {
        const { apiClient, calls } = buildClient({} as StegoChannelCreatedEvent);
        const actions = createStegoActions(apiClient);
        const input: CreateStegoChannelInput = {
            name: 'broadcast',
            audience: 'general',
            carrier: 'image',
            ephemeralMode: 'expire_after_hours',
            rotationDays: 14,
            ttlHours: 24,
            passphrase: 'secret',
        };
        await actions.createChannel(input);
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/stego/channels',
            body: input,
        });
    });

    it('rotateChannel encodes the channel id and forwards the input body', async () => {
        const { apiClient, calls } = buildClient({} as StegoChannelRotatedEvent);
        const actions = createStegoActions(apiClient);

        await actions.rotateChannel('ch/1 with space', { passphrase: 'next' });
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/stego/channels/${encodeURIComponent('ch/1 with space')}/rotate`,
            body: { passphrase: 'next' },
        });
    });

    it('expireChannel defaults reason to operator_revoked and accepts overrides', async () => {
        const { apiClient, calls } = buildClient({} as StegoChannelExpiredEvent);
        const actions = createStegoActions(apiClient);

        await actions.expireChannel('ch-1');
        expect(calls.at(-1)).toEqual({
            method: 'DELETE',
            path: '/v1/stego/channels/ch-1',
            body: { reason: 'operator_revoked' },
        });

        await actions.expireChannel('ch-1', { reason: 'policy_archived' });
        expect(calls.at(-1)?.body).toEqual({ reason: 'policy_archived' });
    });

    it('fetchChannel encodes the channel id', async () => {
        const { apiClient, calls } = buildClient<StegoChannelSnapshot>(
            {} as StegoChannelSnapshot
        );
        const actions = createStegoActions(apiClient);

        await actions.fetchChannel('ch 9');
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: `/v1/stego/channels/${encodeURIComponent('ch 9')}`,
        });
    });
});

describe('computeStegoExpiryAt', () => {
    const baseChannel: Pick<
        StegoChannelSnapshot,
        'ephemeralMode' | 'ttlHours' | 'createdAt' | 'lastRotatedAt'
    > = {
        ephemeralMode: 'expire_after_hours',
        ttlHours: 24,
        createdAt: '2026-04-30T00:00:00.000Z',
    };

    it('returns null for persistent channels', () => {
        expect(
            computeStegoExpiryAt({ ...baseChannel, ephemeralMode: 'persistent' })
        ).toBeNull();
    });

    it('returns null for delete_on_read channels (event-driven, not time-driven)', () => {
        expect(
            computeStegoExpiryAt({ ...baseChannel, ephemeralMode: 'delete_on_read' })
        ).toBeNull();
    });

    it('returns null when ttlHours is missing or non-positive', () => {
        expect(computeStegoExpiryAt({ ...baseChannel, ttlHours: undefined })).toBeNull();
        expect(computeStegoExpiryAt({ ...baseChannel, ttlHours: 0 })).toBeNull();
        expect(computeStegoExpiryAt({ ...baseChannel, ttlHours: -3 })).toBeNull();
    });

    it('returns the createdAt + ttlHours when never rotated', () => {
        expect(computeStegoExpiryAt(baseChannel)).toBe('2026-05-01T00:00:00.000Z');
    });

    it('uses lastRotatedAt as the anchor when present', () => {
        expect(
            computeStegoExpiryAt({
                ...baseChannel,
                lastRotatedAt: '2026-04-30T06:00:00.000Z',
            })
        ).toBe('2026-05-01T06:00:00.000Z');
    });

    it('returns null when the anchor is unparseable', () => {
        expect(
            computeStegoExpiryAt({
                ...baseChannel,
                createdAt: 'not-a-time',
            })
        ).toBeNull();
    });
});

describe('normalizeStegoChannelId', () => {
    it('lowercases and replaces non-alphanumerics with single dashes', () => {
        expect(normalizeStegoChannelId('Broadcast / General #1')).toBe('broadcast-general-1');
    });

    it('trims leading and trailing dashes', () => {
        expect(normalizeStegoChannelId('---hello---')).toBe('hello');
    });

    it('collapses runs of separators into a single dash', () => {
        expect(normalizeStegoChannelId('a   b___c!!!d')).toBe('a-b-c-d');
    });
});
