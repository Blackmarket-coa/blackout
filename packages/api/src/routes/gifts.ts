import { Hono } from 'hono';
import { z } from 'zod';
import { GIFT_SKUS } from '@blackout/core';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { writeRateLimit } from '../middleware/rate-limit';
import { GiftError, listGiftCatalog, sendGift } from '../services/gifts';

const gifts = new Hono();
gifts.use('*', writeRateLimit);

const sendSchema = z.object({
    recipientUserId: z.string().min(1),
    sku: z.string().refine((v) => GIFT_SKUS.includes(v), { message: 'unknown gift sku' }),
    contextKind: z.enum(['profile', 'stream', 'post', 'channel_message']),
    contextRef: z.string().min(1).max(512).optional(),
    note: z.string().max(280).optional(),
});

const ERROR_STATUS: Record<GiftError['code'], number> = {
    unknown_sku: 404,
    self_gift_forbidden: 400,
    invalid_context: 400,
};

gifts.get('/catalog', (c) => {
    return c.json({ gifts: listGiftCatalog() });
});

gifts.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to send a gift');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, sendSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const view = sendGift({
            senderUserId: user.sub,
            recipientUserId: parsed.recipientUserId,
            sku: parsed.sku,
            contextKind: parsed.contextKind,
            contextRef: parsed.contextRef,
            note: parsed.note,
        });
        return c.json({ tip: view.tip, gift: view.gift }, 201);
    } catch (error) {
        if (error instanceof GiftError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 404
            );
        }
        throw error;
    }
});

export default gifts;
