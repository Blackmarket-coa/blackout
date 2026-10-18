import { Hono } from 'hono';
import { z } from 'zod';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';
import { db } from '../db/store';
import type { VoteRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { requireUser } from '../middleware/require-user';
import { botPostRefusalResponse, checkBotMayPostAs } from '../services/botPostingGate';
import { routeOutboundMatrixMessage } from '../services/outboundMessageRouter';
import { readJsonBody } from '../middleware/validate';
import { log } from '../telemetry/logger';

/**
 * The legacy channel message store (used by the Expo scaffold's chat screen in
 * `packages/mobile`). Channel ids are free-form strings chosen by the client;
 * the API keeps no membership list for them. The only membership the id itself
 * shows is a DM-shaped id, `dm-<userId>-<userId>`, which names its two
 * participants, so reads of those are limited to the two of them. Every other
 * channel is readable by any signed-in account.
 */
const messages = new Hono();

const sendMessageSchema = z.object({
    content: z.string().min(1),
    // The author is always the session. Older clients still send their own id
    // here; anything else is refused.
    userId: z.string().min(1).optional(),
    stegoTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    sign: z.boolean().optional(),
    matrixRoomId: z.string().optional(),
    governance: z.looseObject({ type: z.string() }).optional(),
});

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DM_CHANNEL_RE = new RegExp(`^dm-(${UUID_PATTERN})-(${UUID_PATTERN})$`, 'i');

/** The two participants a DM-shaped channel id names, or null for any other id. */
const dmChannelParticipants = (channelId: string): [string, string] | null => {
    const match = DM_CHANNEL_RE.exec(channelId);
    return match ? [match[1].toLowerCase(), match[2].toLowerCase()] : null;
};

const mayReadChannel = (userId: string, channelId: string): boolean => {
    const participants = dmChannelParticipants(channelId);
    return participants === null || participants.includes(userId.toLowerCase());
};

messages.get('/:channelId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const { channelId } = c.req.param();
    if (!mayReadChannel(user.sub, channelId)) {
        return c.json(
            {
                code: 'not_channel_member',
                message: 'Only the two people in a direct conversation can read it.',
            },
            403
        );
    }
    const { limit = '50', before } = c.req.query();
    const parsedLimit = Number.parseInt(limit, 10);

    return c.json(db.getMessages(channelId, Number.isNaN(parsedLimit) ? 50 : parsedLimit, before));
});

messages.post('/:channelId', async (c) => {
    const session = requireUser(c);
    if (session instanceof Response) return session;
    const { channelId } = c.req.param();
    const parsed = await readJsonBody(c, sendMessageSchema);
    if (parsed instanceof Response) return parsed;
    const { content, stegoTier = 1, sign = false, matrixRoomId, governance } = parsed;

    if (parsed.userId !== undefined && parsed.userId !== session.sub) {
        return c.json({ code: 'user_mismatch', message: 'You can only post as yourself.' }, 403);
    }
    const userId = session.sub;

    const user = db.getUserById(userId);
    if (!user) {
        return c.json({ code: 'user_not_found', message: 'Unknown user' }, 404);
    }

    // Naming a room makes the bot post the text there in plaintext, under this
    // user's name, and fans it out to any bridged Twitch/YouTube chat. Check the
    // room before storing anything: the author must be a joined member who may
    // post, the room unencrypted, and the bot in it.
    if (matrixRoomId) {
        const verdict = await checkBotMayPostAs(userId, matrixRoomId);
        if (!verdict.ok) {
            const refusal = botPostRefusalResponse(verdict.reason);
            return c.json(refusal.body, refusal.status);
        }
    }

    let transformedContent = content;
    let encryptionAlgorithm: string | undefined;

    if (stegoTier === 3) {
        transformedContent = encodeStego(content, process.env.STEGO_KEY ?? 'local-stego-key');
        encryptionAlgorithm = 'steganography';
    } else if (stegoTier === 2) {
        transformedContent = encryptE2E(content, user.pubkeyEd25519);
        encryptionAlgorithm = 'e2e';
    }

    const message = db.createMessage({
        id: crypto.randomUUID(),
        channelId,
        userId,
        content: transformedContent,
        governance:
            governance?.type === 'poll'
                ? (governance as { type: 'poll'; data: VoteRecord })
                : undefined,
        contentStegoTier: stegoTier,
        signature: sign ? signMessage(content, userId) : undefined,
        isEncrypted: stegoTier > 1,
        encryptionAlgorithm,
    });

    const federatedPreview = formatFederatedMessage(user.username, content);
    const matrix = matrixRoomId
        ? await matrixClient.sendMessage(matrixRoomId, federatedPreview)
        : null;

    // After landing the message in the Blackout-side Matrix room, fan it
    // out to any source platforms bridged to that room (Twitch chat bridge
    // → Twitch IRC; YouTube chat bridge → liveChatMessages.insert). Only
    // the plain `m.text` body — encrypted / steganographic content stays
    // Blackout-internal because it isn't meaningful to a Twitch viewer.
    // Loop prevention: this dispatch path never carries `m.blackout.origin`,
    // so the chat-bridge ingress side doesn't see its own echo.
    let outboundFanout: Awaited<ReturnType<typeof routeOutboundMatrixMessage>> | null = null;
    if (matrixRoomId && stegoTier === 1) {
        try {
            outboundFanout = await routeOutboundMatrixMessage(matrixRoomId, content);
        } catch (err) {
            log.warn('messages_outbound_router_threw', {
                matrixRoomId,
                error: String(err),
            });
        }
    }

    return c.json({ message, matrix, outboundFanout }, 201);
});

export default messages;
