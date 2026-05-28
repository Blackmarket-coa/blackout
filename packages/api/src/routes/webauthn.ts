import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
    issueChallenge,
    consumeChallenge,
    parseClientData,
    readWebAuthnConfig,
    verifyAttestation,
    verifyAssertion,
    purgeExpiredChallenges,
} from '../services/webauthn';
import {
    storeCredential,
    findCredential,
    listCredentialsByUser,
} from '../services/webauthnStore';
import { signJwtWithMeta } from '../services/auth';
import { issueRefreshToken } from '../services/refreshToken';
import { readAuthRuntimeConfig } from '../services/auth';
import { setCookie } from 'hono/cookie';
import { log } from '../telemetry/logger';

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

const registerBeginSchema = z.object({});

router.post('/register/begin', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    purgeExpiredChallenges();

    const challenge = issueChallenge(user.sub, 'register');
    return c.json({
        challenge: challenge.challenge,
        rp: { id: status.cfg.rpId, name: status.cfg.rpName },
        user: { id: user.sub, name: user.username, displayName: user.username },
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
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);

    const parsed = await readJsonBody(c, registerFinishSchema);
    if (parsed instanceof Response) return parsed;

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    const challengeRecord = consumeChallenge(cd.challenge, {
        userId: user.sub,
        purpose: 'register',
    });
    if (!challengeRecord) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAttestation({
        response: parsed.credential as Parameters<typeof verifyAttestation>[0]['response'],
        expectedChallenge: challengeRecord.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn attestation rejected', { code: result.code, user_id: user.sub });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    await storeCredential({
        credentialId: result.credentialId,
        userId: user.sub,
        publicKeyCose: result.publicKeyCose,
        signCount: result.signCount,
        transports: result.transports.length > 0
            ? result.transports
            : parsed.credential.response.transports ?? [],
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        label: parsed.label,
    });

    log.info('webauthn credential registered', { user_id: user.sub, credential_id: result.credentialId });
    return c.json({ ok: true, credentialId: result.credentialId });
});

const loginBeginSchema = z.object({});

router.post('/login/begin', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    purgeExpiredChallenges();

    const challenge = issueChallenge(user.sub, 'login');
    const allow = (await listCredentialsByUser(user.sub)).map((c) => ({
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

    const stored = await findCredential(parsed.credential.id);
    if (!stored) {
        return c.json({ code: 'unknown_credential' }, 400);
    }

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    const challengeRecord = consumeChallenge(cd.challenge, {
        userId: stored.userId,
        purpose: 'login',
    });
    if (!challengeRecord) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAssertion({
        response: parsed.credential as Parameters<typeof verifyAssertion>[0]['response'],
        expectedChallenge: challengeRecord.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn assertion rejected', { code: result.code, user_id: stored.userId });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    // Issue a session after successful WebAuthn login
    const db = await import('../db/store').then((m) => m.db);
    const userRecord = db.getUserById(stored.userId);
    if (!userRecord) {
        return c.json({ code: 'user_not_found' }, 404);
    }

    const access = signJwtWithMeta(stored.userId, userRecord.username);
    const refresh = issueRefreshToken({ userId: stored.userId });
    const config = readAuthRuntimeConfig();
    if (config.tokenTransport === 'cookie' || config.tokenTransport === 'both') {
        setCookie(c, config.cookieName!, access.token, {
            httpOnly: true,
            secure: config.cookieSecure,
            sameSite: config.cookieSameSite,
            path: '/',
            maxAge: 86400,
        });
    }

    return c.json({ token: access.token, refreshToken: refresh.token, userId: stored.userId, credentialId: result.credentialId, signCount: result.signCount });
});

export default router;
