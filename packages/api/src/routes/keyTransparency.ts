import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import {
    KeyTransparencyLog,
    ed25519Witness,
    nullWitness,
    verifyInclusion,
    verifySignedTreeHead,
    type LogWitness,
} from '../services/keyTransparency';
import { resolveKtStorage } from '../services/keyTransparencyStorage';
import { log } from '../telemetry/logger';

/**
 * Resolve the witness from environment. Operators wire a 32-byte hex or
 * base64url seed via `KT_WITNESS_ED25519_SEED`; if absent we fall back to
 * the explicit `nullWitness`. We never silently mint a key, since that
 * would falsely imply integrity to clients.
 */
const resolveWitness = (): LogWitness => {
    const raw = process.env.KT_WITNESS_ED25519_SEED;
    if (!raw) return nullWitness;
    let seed: Buffer | null = null;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) seed = Buffer.from(raw, 'hex');
    else if (/^[A-Za-z0-9_-]+$/.test(raw)) {
        const decoded = Buffer.from(raw, 'base64url');
        if (decoded.length === 32) seed = decoded;
    }
    if (!seed) {
        throw new Error(
            'KT_WITNESS_ED25519_SEED must be 32 bytes encoded as hex (64 chars) or base64url',
        );
    }
    return ed25519Witness(seed);
};

const ktLog = new KeyTransparencyLog({
    storage: resolveKtStorage(),
    witness: resolveWitness(),
});

const router = new Hono();

const appendSchema = z.object({
    masterKey: z.string().min(1),
});

router.post('/append', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, appendSchema);
    if (parsed instanceof Response) return parsed;

    const result = ktLog.append({
        userId: user.sub,
        masterKey: parsed.masterKey,
        publishedAt: Date.now(),
    });
    log.info('kt log append', { user_id: user.sub, leaf_index: result.leafIndex });
    return c.json({
        leafIndex: result.leafIndex,
        root: result.root,
    });
});

router.get('/root', (c) => c.json(ktLog.root()));

router.get('/sth', (c) => c.json(ktLog.signedTreeHead()));

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
        return c.json({ code: 'bad_range' }, 400);
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

const verifySthSchema = z.object({
    sth: z.object({
        treeSize: z.number().int().nonnegative(),
        rootHash: z.string(),
        issuedAt: z.string(),
        witnessKey: z.string(),
        signature: z.string(),
        scheme: z.union([z.literal('ed25519'), z.literal('none')]),
    }),
});

router.post('/verify-sth', async (c) => {
    const parsed = await readJsonBody(c, verifySthSchema);
    if (parsed instanceof Response) return parsed;
    return c.json({ ok: verifySignedTreeHead(parsed.sth) });
});

export default router;
export const __test__ = { ktLog };
