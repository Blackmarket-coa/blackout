import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { integrationsRateLimit } from '../middleware/rate-limit';
import { listForUser, mint, projectRecord, revoke } from '../services/obsWsPasswords';
import { listSessionsForUser } from '../integrations/obs-ws-compat/server';

const router = new Hono();
// Settings-surface bucket, NOT the tight fail-closed `auth` bucket: the
// broadcast panel lists passwords + sessions on mount alongside its siblings.
router.use('/', integrationsRateLimit);
router.use('/sessions', integrationsRateLimit);
router.use('/:id', integrationsRateLimit);

router.get('/sessions', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to list OBS-WS sessions');
    if (userOrResp instanceof Response) return userOrResp;
    return c.json({ sessions: listSessionsForUser(userOrResp.sub) });
});

const mintSchema = z.object({
    label: z.string().min(1).max(80).optional(),
});

router.get('/', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to list OBS-WS passwords');
    if (userOrResp instanceof Response) return userOrResp;
    return c.json({ passwords: listForUser(userOrResp.sub).map(projectRecord) });
});

router.post('/', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to mint an OBS-WS password');
    if (userOrResp instanceof Response) return userOrResp;
    const parsed = await readJsonBody(c, mintSchema);
    if (parsed instanceof Response) return parsed;

    const out = mint({ blackoutUserId: userOrResp.sub, label: parsed.label });
    switch (out.kind) {
        case 'ok':
            // Plaintext password and ready-to-paste URL slug returned ONCE.
            return c.json(
                {
                    password: projectRecord(out.record),
                    plaintextPassword: out.password,
                    /** URL path the surface points at; prepend the API origin. */
                    url: `/obs-ws/${out.record.id}`,
                },
                201
            );
        case 'invalid_input':
            return c.json({ code: 'invalid_input', message: out.reason }, 400);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

router.delete('/:id', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to revoke an OBS-WS password');
    if (userOrResp instanceof Response) return userOrResp;
    const id = c.req.param('id');
    const reason = c.req.query('reason') || 'user_revoked';
    const out = revoke(userOrResp.sub, id, reason);
    switch (out.kind) {
        case 'ok':
            return c.json({ password: projectRecord(out.record) });
        case 'not_found':
            return c.json({ code: 'not_found', message: 'No password with that id.' }, 404);
        case 'forbidden':
            return c.json({ code: 'forbidden', message: 'You do not own that password.' }, 403);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

export default router;
