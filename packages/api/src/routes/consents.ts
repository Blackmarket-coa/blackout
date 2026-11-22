// A person's own consent records (services/userConsents.ts). Nobody else's are
// readable here, by anyone.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { isConsentKind, recordConsent, withdrawConsent } from '../services/userConsents';

const consents = new Hono();

/** As in routes/coalitionCaches.ts: a token can outlive its account. */
const requireExistingUser = (c: Context) => {
    const user = requireUser(c, 'Sign in required');
    if (user instanceof Response) return user;
    if (!db.getUserById(user.sub)) {
        return c.json({ code: 'unauthorized', message: 'Sign in required' }, 401);
    }
    return user;
};

const recordSchema = z.object({
    kind: z.string().min(1).max(64),
    version: z.number().int().min(1),
    textSha256: z.string().length(64),
    ageConfirmed: z.boolean(),
});

const failureMessages = {
    unknown_kind: 'There is no disclosure of that kind.',
    stale_version:
        'That wording is not the current one. Read the current disclosure and agree to it again.',
    age_required: 'This feature is for people 18 and older. Confirm your age to continue.',
    bad_text_hash: 'textSha256 must be the SHA-256 of the disclosure text, in hex.',
    wrong_text:
        'That is not the current disclosure text. Read the current disclosure and agree to it again.',
} as const;

consents.get('/', (c) => {
    const user = requireExistingUser(c);
    if (user instanceof Response) return user;
    return c.json({ consents: db.listUserConsents(user.sub) });
});

consents.post('/', async (c) => {
    const user = requireExistingUser(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, recordSchema);
    if (body instanceof Response) return body;
    const result = recordConsent(user.sub, body);
    if (!result.ok) {
        return c.json({ code: result.reason, message: failureMessages[result.reason] }, 400);
    }
    return c.json({ consent: result.consent }, 201);
});

consents.post('/:kind/withdraw', (c) => {
    const user = requireExistingUser(c);
    if (user instanceof Response) return user;
    const kind = c.req.param('kind');
    if (!isConsentKind(kind)) {
        return c.json({ code: 'unknown_kind', message: failureMessages.unknown_kind }, 404);
    }
    const consent = withdrawConsent(user.sub, kind);
    if (!consent) {
        return c.json(
            { code: 'not_found', message: 'You have no active agreement of that kind.' },
            404
        );
    }
    return c.json({ consent });
});

export default consents;
