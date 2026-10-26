import { Hono } from 'hono';
import { z } from 'zod';
import { encodeStego, formatFederatedMessage } from '@blackout/core';
import { db } from '../db/store';
import type { MessageRecord, VoteRecord } from '../db/types';
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
 *
 * Nothing on this endpoint is encryption. The text arrives at the API in the
 * request and is stored readable by the server whatever `stegoTier` a client
 * asks for (TRUST.md, "The API message endpoint"):
 *
 *   1  stored as written.
 *   2  stored as written. Until 2026-10-25 this tier XOR-ed the text with the
 *      first 16 characters of a server-stored per-account string and labelled
 *      the result `e2e`; the "key" was minted and held by the server, so the
 *      label was false whatever the cipher
 *      (docs/security/api-findings-triage-2026-10-25.md, finding 3).
 *   3  XOR-ed with the server's `STEGO_KEY` and URL-encoded, so the text is not
 *      readable at a glance by a bridged chat viewer. Reversible by the server,
 *      which holds the key, and by nobody else.
 *
 * So `isEncrypted` is always false and no `encryptionAlgorithm` is recorded;
 * rows written before 2026-10-25 are reported the same way on read.
 */
const messages = new Hono();

const sendMessageSchema = z.object({
    content: z.string().min(1),
    // The author is always the session. Older clients still send their own id
    // here; anything else is refused.
    userId: z.string().min(1).optional(),
    stegoTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    // Accepted so an older client's request still parses; `true` is refused
    // (see the handler) rather than answered with something that is not a
    // signature.
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

/**
 * A stored row as the API now describes it. Rows written before 2026-10-25
 * carry `isEncrypted: true` and `encryptionAlgorithm: 'e2e' | 'steganography'`,
 * neither of which was true; the stored text is left as it is (a tier-2 row
 * from then is XOR-ed with the account's `pubkeyEd25519`, a tier-3 row with
 * the server's `STEGO_KEY`).
 */
const withoutEncryptionClaims = (row: MessageRecord): MessageRecord => {
    const { encryptionAlgorithm: _dropped, ...rest } = row;
    return { ...rest, isEncrypted: false };
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

    return c.json(
        db
            .getMessages(channelId, Number.isNaN(parsedLimit) ? 50 : parsedLimit, before)
            .map(withoutEncryptionClaims)
    );
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

    // Accounts have no signing key: `pubkeyEd25519` on a user record is a
    // random string minted at sign-up, with no private half anywhere. Until
    // 2026-10-25 `sign: true` stored `encodeURIComponent('<userId>:<content>')`
    // as the "signature" — a copy of the text, not a signature. Refusing is the
    // only truthful answer.
    if (sign) {
        return c.json(
            {
                code: 'signing_unavailable',
                message: 'Messages cannot be signed: this account has no signing key.',
            },
            400
        );
    }

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

    const storedContent =
        stegoTier === 3
            ? encodeStego(content, process.env.STEGO_KEY ?? 'local-stego-key')
            : content;

    const message = db.createMessage({
        id: crypto.randomUUID(),
        channelId,
        userId,
        content: storedContent,
        governance:
            governance?.type === 'poll'
                ? (governance as { type: 'poll'; data: VoteRecord })
                : undefined,
        contentStegoTier: stegoTier,
        isEncrypted: false,
    });

    const federatedPreview = formatFederatedMessage(user.username, content);
    const matrix = matrixRoomId
        ? await matrixClient.sendMessage(matrixRoomId, federatedPreview)
        : null;

    // After landing the message in the Blackout-side Matrix room, fan it
    // out to any source platforms bridged to that room (Twitch chat bridge
    // → Twitch IRC; YouTube chat bridge → liveChatMessages.insert). Only
    // tier 1 — a tier-3 body is scrambled and means nothing to a Twitch
    // viewer, and tier 2 keeps the behaviour it had when it was labelled
    // encrypted. Loop prevention: this dispatch path never carries
    // `m.blackout.origin`, so the chat-bridge ingress side doesn't see its
    // own echo.
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
