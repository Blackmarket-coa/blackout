import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    AID_POOL_LIMITS,
    AidPoolError,
    closeAidPool,
    contributeToAidPool,
    createAidPool,
    fulfillAidPool,
    getAidPool,
    listAidPools,
    listAidPoolsByOrganizer,
} from '../services/aidPools';

const aidPools = new Hono();

const createSchema = z.object({
    title: z.string().min(1).max(AID_POOL_LIMITS.maxTitleLength),
    description: z.string().max(AID_POOL_LIMITS.maxDescriptionLength).optional(),
    goalCents: z
        .number()
        .int()
        .min(AID_POOL_LIMITS.minGoalCents)
        .max(AID_POOL_LIMITS.maxGoalCents),
    currency: z.string().min(3).max(8),
});

const contributeSchema = z.object({
    amountCents: z.number().int().min(100),
    note: z.string().max(280).optional(),
});

const ERROR_STATUS: Record<AidPoolError['code'], number> = {
    organizer_unknown: 404,
    goal_out_of_range: 400,
    invalid_currency: 400,
    title_required: 400,
    pool_not_found: 404,
    pool_closed: 410,
    forbidden: 403,
    tip_failed: 400,
};

aidPools.get('/', (c) => {
    return c.json({ pools: listAidPools() });
});

aidPools.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to organize an aid pool');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const pool = createAidPool({
            organizerUserId: user.sub,
            title: parsed.title,
            description: parsed.description,
            goalCents: parsed.goalCents,
            currency: parsed.currency,
        });
        return c.json({ pool }, 201);
    } catch (error) {
        if (error instanceof AidPoolError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 410
            );
        }
        throw error;
    }
});

aidPools.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ pools: listAidPoolsByOrganizer(user.sub) });
});

aidPools.get('/:id', (c) => {
    const pool = getAidPool(c.req.param('id'));
    if (!pool) return c.json({ code: 'pool_not_found', message: 'No such aid pool' }, 404);
    return c.json({ pool });
});

aidPools.post('/:id/contribute', async (c) => {
    const user = requireUser(c, 'Sign in to contribute to an aid pool');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, contributeSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const result = contributeToAidPool({
            poolId: c.req.param('id'),
            contributorUserId: user.sub,
            amountCents: parsed.amountCents,
            note: parsed.note,
        });
        return c.json(result, 201);
    } catch (error) {
        if (error instanceof AidPoolError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 410
            );
        }
        throw error;
    }
});

aidPools.post('/:id/fulfill', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    try {
        const pool = fulfillAidPool(c.req.param('id'), user.sub);
        if (!pool) return c.json({ code: 'pool_not_found', message: 'No such aid pool' }, 404);
        return c.json({ pool });
    } catch (error) {
        if (error instanceof AidPoolError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 410
            );
        }
        throw error;
    }
});

aidPools.post('/:id/close', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    try {
        const pool = closeAidPool(c.req.param('id'), user.sub);
        if (!pool) return c.json({ code: 'pool_not_found', message: 'No such aid pool' }, 404);
        return c.json({ pool });
    } catch (error) {
        if (error instanceof AidPoolError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 410
            );
        }
        throw error;
    }
});

export default aidPools;
