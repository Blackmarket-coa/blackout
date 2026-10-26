import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { authRateLimit } from '../middleware/rate-limit';
import {
    issueChallenge,
    consumeChallenge,
    parseClientData,
    readWebAuthnConfig,
    storeCredential,
    listCredentialsByUser,
    findCredential,
    verifyAttestation,
    verifyAssertion,
    purgeExpiredChallenges,
} from '../services/webauthn';
import { resolveBlackoutUserId } from '../services/userIdentity';
import { log } from '../telemetry/logger';

/**
 * Passkeys, behind `WEBAUTHN_ENABLED=1` (`docs/security/webauthn-passkeys.md`).
 *
 * Registering a passkey binds it to the signed-in caller: `register/begin` and
 * `register/finish` take a session, the credential is stored under the
 * caller's Blackout user id, and a `userId` in the body, which older callers
 * sent, must name the caller (by Blackout id or local Matrix id) or the
 * request is refused. Until 2026-10-26 both took any `userId` and no session,
 * so anyone could register their own authenticator under another account (F7
 * in docs/security/api-findings-triage-2026-10-25.md). A credential id is
 * registered once: a second registration of a known id is refused instead of
 * replacing the first, whoever holds it.
 *
 * Signing in with a passkey needs no session by its nature. `login/begin` and
 * `login/finish` take a Blackout id or a local Matrix id and look credentials
 * up under the Blackout id, the key registration stores them under;
 * `login/finish` verifies an assertion and mints no session.
 */
const router = new Hono();

router.use('/*', authRateLimit);

const requireEnabled = () => {
    const cfg = readWebAuthnConfig();
    if (!cfg.enabled) return { ok: false as const };
    if (!cfg.rpId || cfg.expectedOrigins.length === 0) {
        return { ok: false as const, reason: 'rp_misconfigured' };
    }
    return { ok: true as const, cfg };
};

/** Refuses a `userId` that does not name the caller; `null` when it does or is absent. */
const refuseOtherAccount = (
    c: Context,
    callerId: string,
    userId: string | undefined
): Response | null =>
    userId === undefined || resolveBlackoutUserId(userId) === callerId
        ? null
        : c.json(
              {
                  code: 'user_mismatch',
                  message: 'You can only register a passkey for your own account.',
              },
              403
          );

/** The account a sign-in names, as registration keys it; unknown ids pass through. */
const accountForSignIn = (userId: string): string => resolveBlackoutUserId(userId) ?? userId;

const registerBeginSchema = z.object({ userId: z.string().min(1).optional() });

router.post('/register/begin', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    const user = requireUser(c, 'Sign in to add a passkey');
    if (user instanceof Response) return user;
    purgeExpiredChallenges();

    // The body is optional: a caller that sends none, or `{}`, registers for itself.
    const raw = await c.req.text();
    let body: unknown = {};
    if (raw.trim().length > 0) {
        try {
            body = JSON.parse(raw);
        } catch {
            return c.json(
                { code: 'invalid_request', message: 'Request body must be valid JSON' },
                400
            );
        }
    }
    const parsed = registerBeginSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Request body failed validation' }, 400);
    }
    const refused = refuseOtherAccount(c, user.sub, parsed.data.userId);
    if (refused) return refused;

    const challenge = issueChallenge(user.sub, 'register');
    const name = user.username || user.sub;
    return c.json({
        challenge: challenge.challenge,
        rp: { id: status.cfg.rpId, name: status.cfg.rpName },
        user: { id: user.sub, name, displayName: name },
        pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -8 }, // EdDSA
            { type: 'public-key', alg: -257 }, // RS256
        ],
        timeout: 60_000,
        attestation: 'none',
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
        },
    });
});

const registerFinishSchema = z.object({
    userId: z.string().min(1).optional(),
    label: z.string().min(1).max(64),
    credential: z.object({
        id: z.string().min(1),
        rawId: z.string().min(1),
        response: z.object({
            clientDataJSON: z.string().min(1),
            attestationObject: z.string().min(1),
            transports: z.array(z.string()).optional(),
        }),
        type: z.literal('public-key'),
    }),
});

router.post('/register/finish', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    const user = requireUser(c, 'Sign in to add a passkey');
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, registerFinishSchema);
    if (parsed instanceof Response) return parsed;
    const refused = refuseOtherAccount(c, user.sub, parsed.userId);
    if (refused) return refused;

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    // The challenge was issued to the caller's session; one issued to anyone
    // else does not match.
    const challenge = consumeChallenge(cd.challenge, {
        userId: user.sub,
        purpose: 'register',
    });
    if (!challenge) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAttestation({
        response: parsed.credential as Parameters<typeof verifyAttestation>[0]['response'],
        expectedChallenge: challenge.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn attestation rejected', { code: result.code, user_id: user.sub });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    // With `attestation: 'none'` the authenticator vouches for nothing, so a
    // crafted response can carry any credential id. Storing a known id would
    // replace the existing record, someone else's passkey included.
    if (findCredential(result.credentialId)) {
        log.warn('webauthn credential id already registered', { user_id: user.sub });
        return c.json(
            { code: 'credential_exists', message: 'That passkey is already registered.' },
            409
        );
    }

    storeCredential({
        credentialId: result.credentialId,
        userId: user.sub,
        publicKeyCose: result.publicKeyCose,
        signCount: result.signCount,
        transports:
            result.transports.length > 0
                ? result.transports
                : parsed.credential.response.transports ?? [],
        createdAt: Date.now(),
        lastUsedAt: null,
        label: parsed.label,
    });

    log.info('webauthn credential registered', {
        user_id: user.sub,
        credential_id: result.credentialId,
    });
    return c.json({ ok: true, credentialId: result.credentialId });
});

const loginBeginSchema = z.object({ userId: z.string().min(1) });

router.post('/login/begin', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    purgeExpiredChallenges();

    const parsed = await readJsonBody(c, loginBeginSchema);
    if (parsed instanceof Response) return parsed;
    const userId = accountForSignIn(parsed.userId);

    const challenge = issueChallenge(userId, 'login');
    const allow = listCredentialsByUser(userId).map((c) => ({
        type: 'public-key' as const,
        id: c.credentialId,
        transports: c.transports,
    }));

    return c.json({
        challenge: challenge.challenge,
        rpId: status.cfg.rpId,
        timeout: 60_000,
        userVerification: 'preferred',
        allowCredentials: allow,
    });
});

const loginFinishSchema = z.object({
    userId: z.string().min(1),
    credential: z.object({
        id: z.string().min(1),
        rawId: z.string().min(1),
        response: z.object({
            clientDataJSON: z.string().min(1),
            authenticatorData: z.string().min(1),
            signature: z.string().min(1),
            userHandle: z.string().optional(),
        }),
        type: z.literal('public-key'),
    }),
});

router.post('/login/finish', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);

    const parsed = await readJsonBody(c, loginFinishSchema);
    if (parsed instanceof Response) return parsed;
    const userId = accountForSignIn(parsed.userId);

    const stored = findCredential(parsed.credential.id);
    if (!stored || stored.userId !== userId) {
        return c.json({ code: 'unknown_credential' }, 400);
    }

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    const challenge = consumeChallenge(cd.challenge, {
        userId,
        purpose: 'login',
    });
    if (!challenge) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAssertion({
        response: parsed.credential as Parameters<typeof verifyAssertion>[0]['response'],
        expectedChallenge: challenge.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn assertion rejected', { code: result.code, user_id: userId });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    return c.json({ ok: true, credentialId: result.credentialId, signCount: result.signCount });
});

export default router;
