import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    captureTip,
    createTip,
    getTip,
    listTipsReceivedBy,
    listTipsSentBy,
    refundTip,
    TipValidationError,
    TIP_LIMITS,
} from '../services/tips';

const tips = new Hono();

const createTipSchema = z.object({
    recipientUserId: z.string().min(1),
    contextKind: z.enum(['profile', 'stream', 'post', 'channel_message', 'aid_pool']),
    contextRef: z.string().min(1).max(512).optional(),
    grossCents: z.number().int().min(TIP_LIMITS.minCents).max(TIP_LIMITS.maxCents),
    currency: z.string().min(3).max(8),
    note: z.string().max(TIP_LIMITS.maxNoteLength).optional(),
});

const captureSchema = z.object({
    fbmOrderId: z.string().min(1).max(255).optional(),
});

const ERROR_STATUS: Record<TipValidationError['code'], number> = {
    self_tip_forbidden: 400,
    recipient_unknown: 404,
    amount_below_floor: 400,
    amount_above_ceiling: 400,
    invalid_currency: 400,
    note_too_long: 400,
    duplicate_order: 409,
};

tips.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to send a tip');
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, createTipSchema);
    if (parsed instanceof Response) return parsed;

    try {
        const tip = createTip({
            senderUserId: user.sub,
            recipientUserId: parsed.recipientUserId,
            contextKind: parsed.contextKind,
            contextRef: parsed.contextRef,
            grossCents: parsed.grossCents,
            currency: parsed.currency,
            note: parsed.note,
        });
        return c.json({ tip }, 201);
    } catch (error) {
        if (error instanceof TipValidationError) {
            return c.json({ code: error.code, message: error.message }, ERROR_STATUS[error.code] as 400 | 404 | 409);
        }
        throw error;
    }
});

tips.get('/received', (c) => {
    const user = requireUser(c, 'Sign in to view tips received');
    if (user instanceof Response) return user;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : undefined;
    return c.json({ tips: listTipsReceivedBy(user.sub, limit) });
});

tips.get('/sent', (c) => {
    const user = requireUser(c, 'Sign in to view tips sent');
    if (user instanceof Response) return user;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : undefined;
    return c.json({ tips: listTipsSentBy(user.sub, limit) });
});

tips.get('/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const tip = getTip(c.req.param('id'));
    if (!tip) return c.json({ code: 'tip_not_found', message: 'No such tip' }, 404);
    if (tip.senderUserId !== user.sub && tip.recipientUserId !== user.sub) {
        return c.json({ code: 'tip_not_found', message: 'No such tip' }, 404);
    }
    return c.json({ tip });
});

// Admin/webhook capture path. Guarded by the same admin API key the
// subscriptions module uses; in production this is invoked by the FBM
// webhook dispatcher once payment confirms.
tips.post('/:id/capture', async (c) => {
    const expected = process.env.BLACKOUT_ADMIN_API_KEY ?? 'dev-admin-key';
    const got = c.req.header('x-admin-api-key');
    if (!got || got !== expected) {
        return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
    }
    const parsed = await readJsonBody(c, captureSchema);
    const detail = parsed instanceof Response ? {} : parsed;
    const tip = captureTip(c.req.param('id'), detail);
    if (!tip) return c.json({ code: 'tip_not_found', message: 'No such tip' }, 404);
    return c.json({ tip });
});

tips.post('/:id/refund', async (c) => {
    const expected = process.env.BLACKOUT_ADMIN_API_KEY ?? 'dev-admin-key';
    const got = c.req.header('x-admin-api-key');
    if (!got || got !== expected) {
        return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
    }
    const tip = refundTip(c.req.param('id'));
    if (!tip) return c.json({ code: 'tip_not_found', message: 'No such tip' }, 404);
    return c.json({ tip });
});

export default tips;
