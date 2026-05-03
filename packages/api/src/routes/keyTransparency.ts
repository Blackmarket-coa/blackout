import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { KeyTransparencyLog, verifyInclusion } from '../services/keyTransparency';
import { log } from '../telemetry/logger';

/**
 * Process-local log instance. Production deployments should swap this
 * for a backed implementation that persists leaves and witnesses roots
 * to a separate auditor; the in-memory log here is correct under the
 * RFC 6962 construction and useful for dev / test / single-node
 * operators.
 */
const ktLog = new KeyTransparencyLog();

const router = new Hono();

const appendSchema = z.object({
    userId: z.string().min(1),
    masterKey: z.string().min(1),
});

router.post('/append', async (c) => {
    const parsed = await readJsonBody(c, appendSchema);
    if (parsed instanceof Response) return parsed;

    const result = ktLog.append({
        userId: parsed.userId,
        masterKey: parsed.masterKey,
        publishedAt: Date.now(),
    });
    log.info('kt log append', { user_id: parsed.userId, leaf_index: result.leafIndex });
    return c.json({
        leafIndex: result.leafIndex,
        root: result.root,
    });
});

router.get('/root', (c) => c.json(ktLog.root()));

router.get('/inclusion/:leafIndex', (c) => {
    const idx = Number.parseInt(c.req.param('leafIndex'), 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ktLog.size()) {
        return c.json({ code: 'leaf_not_found' }, 404);
    }
    return c.json(ktLog.inclusionProof(idx));
});

router.get('/consistency', (c) => {
    const from = Number.parseInt(c.req.query('from') ?? '', 10);
    const to = Number.parseInt(c.req.query('to') ?? '', 10);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
        return c.json({ code: 'bad_range' }, 400);
    }
    try {
        return c.json(ktLog.consistencyProof(from, to));
    } catch (error) {
        return c.json({ code: 'bad_range', detail: (error as Error).message }, 400);
    }
});

router.get('/lookup/:userId', (c) => {
    const userId = c.req.param('userId');
    return c.json({ entries: ktLog.findEntriesByUser(userId) });
});

const verifySchema = z.object({
    proof: z.object({
        leafIndex: z.number().int().nonnegative(),
        treeSize: z.number().int().positive(),
        auditPath: z.array(z.string()),
        leafHash: z.string(),
    }),
    expectedRoot: z.object({
        treeSize: z.number().int().nonnegative(),
        rootHash: z.string(),
    }),
});

router.post('/verify', async (c) => {
    const parsed = await readJsonBody(c, verifySchema);
    if (parsed instanceof Response) return parsed;
    return c.json({ ok: verifyInclusion(parsed.proof, parsed.expectedRoot) });
});

export default router;
export const __test__ = { ktLog };
