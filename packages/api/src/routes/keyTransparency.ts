import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    KeyTransparencyLog,
    ed25519Witness,
    nullWitness,
    verifyInclusion,
    verifySignedTreeHead,
    type LogWitness,
} from '../services/keyTransparency';
import { resolveKtStorage } from '../services/keyTransparencyStorage';
import { matrixUserIdFor, resolveBlackoutUserId } from '../services/userIdentity';
import { log } from '../telemetry/logger';

/**
 * Resolve the witness from environment. Operators wire a 32-byte hex or
 * base64url seed via `KT_WITNESS_ED25519_SEED`; if absent we fall back to
 * the explicit `nullWitness`. We never silently mint a key, since that
 * would falsely imply integrity to clients.
 *
 * No other server key is borrowed for this. The API holds HMAC secrets for
 * its session tokens (useless to a third-party auditor, and not to be reused
 * for a second purpose) and an optional Ed25519 canary key
 * (`BLACKOUT_CANARY_SIGNING_KEY`), which signs the warrant canary and nothing
 * else; one key per purpose. Without the seed the STH says `scheme: 'none'`
 * and `/verify-sth` answers `signed: false` — see
 * docs/security/api-findings-triage-2026-10-25.md, finding 1.
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
            'KT_WITNESS_ED25519_SEED must be 32 bytes encoded as hex (64 chars) or base64url'
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
    /**
     * The account the key belongs to, as the caller's own Matrix id or Blackout
     * id. Omitted, it is the caller's Matrix id. Anything else is refused.
     */
    userId: z.string().min(1).max(255).optional(),
    masterKey: z.string().min(1).max(4096),
});

/**
 * Publish a cross-signing master key. Signed-in callers only, and only for
 * their own account: the log is what a client checks its OWN key against, so
 * an entry anyone could write for anyone would let an attacker plant a key
 * that then "verifies". Until 2026-10-25 this route took no session and any
 * `userId` (docs/security/api-findings-triage-2026-10-25.md, finding 1). A
 * Matrix id on another homeserver never resolves to a local account
 * (services/userIdentity.ts), so `@<my username>:elsewhere` is refused too.
 */
router.post('/append', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, appendSchema);
    if (parsed instanceof Response) return parsed;

    const own = matrixUserIdFor(user.sub);
    if (!own) return c.json({ code: 'unauthorized', message: 'Unknown account' }, 401);
    const userId = parsed.userId ?? own;
    if (resolveBlackoutUserId(userId) !== user.sub) {
        return c.json(
            {
                code: 'user_mismatch',
                message: 'You can only publish keys for your own account.',
            },
            403
        );
    }

    const result = ktLog.append({
        userId,
        masterKey: parsed.masterKey,
        publishedAt: Date.now(),
    });
    log.info('kt log append', { user_id: userId, leaf_index: result.leafIndex });
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

/**
 * `ok` says the STH is well-formed for its scheme — for `scheme: 'none'` that
 * means it carries no signature and no key. `signed` says a witness signature
 * was present AND verified; an unsigned STH is `ok` but not `signed`, so a
 * caller cannot read `ok: true` as "a witness vouches for this root".
 */
router.post('/verify-sth', async (c) => {
    const parsed = await readJsonBody(c, verifySthSchema);
    if (parsed instanceof Response) return parsed;
    const ok = verifySignedTreeHead(parsed.sth);
    return c.json({ ok, signed: ok && parsed.sth.scheme === 'ed25519' });
});

export default router;
export const __test__ = { ktLog };
