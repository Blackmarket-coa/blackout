import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent } from './domain-events';
import {
    createChannel,
    expireChannel,
    fetchChannel,
    listChannels,
    rotateChannel,
    StegoChannelExistsError,
    StegoChannelNotFoundError,
    type StegoChannelExpiryReason,
} from '../services/stegoStore';
import type { FeatureModule } from './types';

const carrierSchema = z.enum(['text', 'image', 'audio']);
const ephemeralSchema = z.enum(['persistent', 'expire_after_hours', 'delete_on_read']);
const expiryReasonSchema = z.enum([
    'ttl_elapsed',
    'read_consumed',
    'operator_revoked',
    'policy_archived',
]);

const createSchema = z.object({
    name: z.string().min(1).max(120),
    audience: z.string().min(1).max(120),
    carrier: carrierSchema,
    ephemeralMode: ephemeralSchema,
    ttlHours: z.number().int().min(1).max(168).optional(),
    rotationDays: z.number().int().min(0).max(365),
    passphrase: z.string().min(8).max(512),
});

const rotateSchema = z.object({
    passphrase: z.string().min(8).max(512),
    rotatedAt: z.string().optional(),
});

const expireSchema = z.object({
    reason: expiryReasonSchema.optional(),
});

const ROOM_ID = 'stego://lifecycle';

function makeEnvelope<T>(name: string, senderId: string, payload: T) {
    return {
        event: name,
        roomId: ROOM_ID,
        senderId,
        occurredAt: new Date().toISOString(),
        payload,
    };
}

function createStegoRouter() {
    const stego = new Hono();

    stego.get('/channels', (c) => {
        const denied = requireDomainCapability(c, 'stego', 'read');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        return c.json({ subject, channels: listChannels(subject) });
    });

    stego.post('/channels', async (c) => {
        const denied = requireDomainCapability(c, 'stego', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const parsed = await readJsonBody(c, createSchema);
        if (parsed instanceof Response) return parsed;
        if (parsed.ephemeralMode === 'expire_after_hours' && !parsed.ttlHours) {
            return c.json(
                { code: 'invalid_request', message: 'ttlHours required for expire_after_hours' },
                400,
            );
        }
        try {
            const { snapshot } = await createChannel(subject, parsed);
            const envelope = makeEnvelope(
                'blackout.stego.channel.created',
                subject,
                {
                    channelId: snapshot.channelId,
                    name: snapshot.name,
                    audience: snapshot.audience,
                    carrier: snapshot.carrier,
                    ephemeralMode: snapshot.ephemeralMode,
                    ttlHours: snapshot.ttlHours,
                    rotationDays: snapshot.rotationDays,
                    createdAt: snapshot.createdAt,
                },
            );
            emitDomainEvent({
                module: 'stego',
                type: 'stego.channel.created',
                payload: { subject, channelId: snapshot.channelId },
            });
            return c.json(envelope, 201);
        } catch (error) {
            if (error instanceof StegoChannelExistsError) {
                return c.json(
                    { code: 'channel_exists', message: error.message, channelId: error.channelId },
                    409,
                );
            }
            return c.json({ code: 'invalid_request', message: (error as Error).message }, 400);
        }
    });

    stego.get('/channels/:channelId', (c) => {
        const denied = requireDomainCapability(c, 'stego', 'read');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const { channelId } = c.req.param();
        const snapshot = fetchChannel(subject, channelId);
        if (!snapshot) {
            return c.json({ code: 'channel_not_found', message: 'Channel not found' }, 404);
        }
        return c.json(snapshot);
    });

    stego.post('/channels/:channelId/rotate', async (c) => {
        const denied = requireDomainCapability(c, 'stego', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const parsed = await readJsonBody(c, rotateSchema);
        if (parsed instanceof Response) return parsed;
        const { channelId } = c.req.param();
        try {
            const { snapshot, materialFingerprint } = await rotateChannel(subject, channelId, parsed);
            const envelope = makeEnvelope(
                'blackout.stego.channel.rotated',
                subject,
                {
                    channelId,
                    rotatedAt: snapshot.lastRotatedAt!,
                    rotationIndex: snapshot.rotationIndex,
                    materialFingerprint,
                },
            );
            emitDomainEvent({
                module: 'stego',
                type: 'stego.channel.rotated',
                payload: { subject, channelId, rotationIndex: snapshot.rotationIndex },
            });
            return c.json(envelope);
        } catch (error) {
            if (error instanceof StegoChannelNotFoundError) {
                return c.json({ code: 'channel_not_found', message: error.message }, 404);
            }
            return c.json({ code: 'invalid_request', message: (error as Error).message }, 400);
        }
    });

    stego.delete('/channels/:channelId', async (c) => {
        const denied = requireDomainCapability(c, 'stego', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const { channelId } = c.req.param();
        let reason: StegoChannelExpiryReason = 'operator_revoked';
        const ct = c.req.header('content-type') ?? '';
        const lenLike = c.req.header('content-length');
        const hasBody = ct.includes('application/json') && lenLike !== '0' && lenLike !== undefined;
        if (hasBody) {
            try {
                const raw = (await c.req.json()) as { reason?: unknown };
                const parsed = expireSchema.safeParse(raw);
                if (parsed.success && parsed.data.reason) {
                    reason = parsed.data.reason;
                }
            } catch {
                // empty / unparsable body is fine — fall back to operator_revoked
            }
        }
        try {
            const snapshot = expireChannel(subject, channelId, reason);
            const envelope = makeEnvelope(
                'blackout.stego.channel.expired',
                subject,
                {
                    channelId,
                    expiredAt: snapshot.expiredAt!,
                    reason: snapshot.expiryReason!,
                },
            );
            emitDomainEvent({
                module: 'stego',
                type: 'stego.channel.expired',
                payload: { subject, channelId, reason: snapshot.expiryReason },
            });
            return c.json(envelope);
        } catch (error) {
            if (error instanceof StegoChannelNotFoundError) {
                return c.json({ code: 'channel_not_found', message: error.message }, 404);
            }
            return c.json({ code: 'invalid_request', message: (error as Error).message }, 400);
        }
    });

    return stego;
}

export const stegoModule: FeatureModule = {
    id: 'stego',
    mountPath: '/stego',
    registerRoutes: createStegoRouter,
};
