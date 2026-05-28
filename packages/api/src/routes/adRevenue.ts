import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/require-admin';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    AdRevenueError,
    allocateShares,
    createPeriod,
    getPeriod,
    getShare,
    listPeriods,
    listSharesForCreator,
    listSharesForPeriod,
    markSharePaid,
    voidShare,
} from '../services/adRevenue';

const adRevenue = new Hono();

const createPeriodSchema = z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    totalCents: z.number().int().min(0),
    currency: z.string().min(3).max(8),
    notes: z.string().max(2000).optional(),
});

const allocateSchema = z.object({
    entries: z
        .array(
            z.object({
                creatorUserId: z.string().min(1),
                grossCents: z.number().int().min(0),
            })
        )
        .min(1)
        .max(10_000),
});

const markPaidSchema = z.object({
    fbmPayoutId: z.string().min(1).max(255),
});

const ERROR_STATUS: Record<AdRevenueError['code'], number> = {
    period_not_found: 404,
    period_window_invalid: 400,
    invalid_currency: 400,
    amount_negative: 400,
    creator_unknown: 404,
    duplicate_creator: 409,
    period_already_allocated: 409,
    totals_exceed_period: 400,
    share_not_found: 404,
    share_not_pending: 409,
};

// Admin gate is provided by the shared middleware (packages/api/src/middleware/require-admin.ts).

function handleAdRevenueError(c: import('hono').Context, error: AdRevenueError): Response {
    return c.json(
        { code: error.code, message: error.message },
        ERROR_STATUS[error.code] as 400 | 404 | 409
    );
}

// Admin-only period + allocation surface.

adRevenue.post('/periods', async (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const parsed = await readJsonBody(c, createPeriodSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const period = createPeriod({
            periodStart: parsed.periodStart,
            periodEnd: parsed.periodEnd,
            totalCents: parsed.totalCents,
            currency: parsed.currency,
            notes: parsed.notes,
        });
        return c.json({ period }, 201);
    } catch (error) {
        if (error instanceof AdRevenueError) return handleAdRevenueError(c, error);
        throw error;
    }
});

adRevenue.get('/periods', (c) => {
    return c.json({ periods: listPeriods() });
});

adRevenue.get('/periods/:id', (c) => {
    const period = getPeriod(c.req.param('id'));
    if (!period) return c.json({ code: 'period_not_found', message: 'No such period' }, 404);
    return c.json({ period });
});

adRevenue.post('/periods/:id/allocate', async (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const parsed = await readJsonBody(c, allocateSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const result = allocateShares(c.req.param('id'), parsed.entries);
        return c.json(result, 201);
    } catch (error) {
        if (error instanceof AdRevenueError) return handleAdRevenueError(c, error);
        throw error;
    }
});

adRevenue.get('/periods/:id/shares', (c) => {
    return c.json({ shares: listSharesForPeriod(c.req.param('id')) });
});

// Creator self-read — sees their own shares across periods.
adRevenue.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ shares: listSharesForCreator(user.sub) });
});

adRevenue.get('/shares/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const share = getShare(c.req.param('id'));
    if (!share) return c.json({ code: 'share_not_found', message: 'No such share' }, 404);
    if (share.creatorUserId !== user.sub) {
        const admin = requireAdmin(c);
        if (admin !== true) return c.json({ code: 'share_not_found', message: 'No such share' }, 404);
    }
    return c.json({ share });
});

adRevenue.post('/shares/:id/mark-paid', async (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const parsed = await readJsonBody(c, markPaidSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const share = markSharePaid(c.req.param('id'), parsed.fbmPayoutId);
        if (!share) return c.json({ code: 'share_not_found', message: 'No such share' }, 404);
        return c.json({ share });
    } catch (error) {
        if (error instanceof AdRevenueError) return handleAdRevenueError(c, error);
        throw error;
    }
});

adRevenue.post('/shares/:id/void', (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    try {
        const share = voidShare(c.req.param('id'));
        if (!share) return c.json({ code: 'share_not_found', message: 'No such share' }, 404);
        return c.json({ share });
    } catch (error) {
        if (error instanceof AdRevenueError) return handleAdRevenueError(c, error);
        throw error;
    }
});

export default adRevenue;
