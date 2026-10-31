import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
    RELEASE_IDENTITY_ERRORS,
    RELEASE_IDENTITY_PUBLISHES_PER_DAY,
    RELEASE_IDENTITY_STORAGE_LIMIT,
} from '@blackout/protocol';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    accountForLocalMatrixId,
    publishReleaseIdentity,
    releaseIdentityEntryFor,
} from '../services/releaseIdentities';

/**
 * Release identities: the public keys people publish for dead-man switch
 * releases (`docs/security/release-identities-2026-10-26.md`).
 *
 *   GET  /v1/release-identities/me           the caller's own entry
 *   PUT  /v1/release-identities/me           publish the caller's identity
 *   POST /v1/release-identities/lookup       by Matrix id, this homeserver only
 *   GET  /v1/release-identities/:accountId   anyone's entry
 *
 * The lookup is a POST with `{ matrixId }` in the body, not a GET with the id
 * in the query string, so that "this address looked up @bob" stays out of
 * the URL, which proxies log with the client's address (`infra/nginx/nginx.conf`
 * logs `$request`). A GET to `/lookup` reaches `/:accountId` and gets the
 * same 404 as anyone unknown.
 *
 * Signed-in callers only, and no capability scope: like the API's other
 * routes outside the feature modules, these are gated by the session, and
 * the one write acts on the caller's own identity. Any signed-in account can
 * read any account's identities: comparing a safety code with someone needs
 * theirs, and there is no contact model to narrow it by.
 */
const releaseIdentities = new Hono();

/**
 * One answer for nobody: an unknown account, an account without an
 * identity, a Matrix id on another homeserver and a malformed one all get
 * it, so the directory says no more than whether someone has published.
 */
const NOT_FOUND = {
    code: RELEASE_IDENTITY_ERRORS.notFound,
    message: 'No release identity',
} as const;

const notFound = (c: Context) => c.json(NOT_FOUND, 404);

// Bounds and exact fields only; `verifyReleaseIdentity` checks the rest. A
// body that carries anything else, private keys included, is refused whole.
const publishSchema = z.strictObject({
    identity: z.strictObject({
        v: z.literal(1),
        accountId: z.string().min(1).max(128),
        signingKey: z.string().max(64),
        x25519Key: z.string().max(64),
        mlkem768Key: z.string().max(1600),
        signature: z.string().max(100),
    }),
});

releaseIdentities.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json(releaseIdentityEntryFor(user.sub));
});

releaseIdentities.put('/me', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, publishSchema);
    if (parsed instanceof Response) return parsed;
    if (parsed.identity.accountId !== user.sub) {
        return c.json(
            {
                code: RELEASE_IDENTITY_ERRORS.notYours,
                message: 'You can publish only your own release identity.',
            },
            403
        );
    }

    const outcome = await publishReleaseIdentity(user.sub, parsed.identity);
    switch (outcome.kind) {
        case 'published':
            return c.json(
                { ...outcome.entry, changed: outcome.changed },
                outcome.changed ? 201 : 200
            );
        case 'invalid':
            return c.json(
                {
                    code: RELEASE_IDENTITY_ERRORS.invalid,
                    message: 'The release identity did not pass its checks.',
                    reason: outcome.problem,
                },
                400
            );
        case 'not_yours':
            return c.json(
                {
                    code: RELEASE_IDENTITY_ERRORS.notYours,
                    message: 'You can publish only your own release identity.',
                },
                403
            );
        case 'reused':
            return c.json(
                {
                    code: RELEASE_IDENTITY_ERRORS.reused,
                    message:
                        'This release identity was replaced before; a replaced identity cannot be made current again.',
                },
                409
            );
        case 'rate_limited':
            c.header('Retry-After', String(outcome.retryAfterSeconds));
            return c.json(
                {
                    code: RELEASE_IDENTITY_ERRORS.rateLimited,
                    message: `At most ${RELEASE_IDENTITY_PUBLISHES_PER_DAY} new release identities in any 24 hours.`,
                    retryAfterSeconds: outcome.retryAfterSeconds,
                },
                429
            );
        case 'limit':
            return c.json(
                {
                    code: RELEASE_IDENTITY_ERRORS.limit,
                    message: `This account has published ${RELEASE_IDENTITY_STORAGE_LIMIT} release identities, as many as are kept.`,
                },
                409
            );
        case 'no_account':
            return c.json({ code: 'user_not_found', message: 'Account no longer exists' }, 404);
    }
});

const lookupSchema = z.strictObject({ matrixId: z.string().min(1).max(255) });

releaseIdentities.post('/lookup', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, lookupSchema);
    if (parsed instanceof Response) return parsed;
    const accountId = accountForLocalMatrixId(parsed.matrixId);
    if (!accountId) return notFound(c);
    const entry = releaseIdentityEntryFor(accountId);
    return entry.current ? c.json(entry) : notFound(c);
});

releaseIdentities.get('/:accountId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const entry = releaseIdentityEntryFor(c.req.param('accountId'));
    return entry.current ? c.json(entry) : notFound(c);
});

export default releaseIdentities;
