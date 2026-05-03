import { Hono } from 'hono';
import { z } from 'zod';
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

const registerBeginSchema = z.object({ userId: z.string().min(1) });

router.post('/register/begin', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    purgeExpiredChallenges();

    const parsed = await readJsonBody(c, registerBeginSchema);
    if (parsed instanceof Response) return parsed;

    const challenge = issueChallenge(parsed.userId, 'register');
    return c.json({
        challenge: challenge.challenge,
        rp: { id: status.cfg.rpId, name: status.cfg.rpName },
        user: { id: parsed.userId, name: parsed.userId, displayName: parsed.userId },
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
    userId: z.string().min(1),
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

    const parsed = await readJsonBody(c, registerFinishSchema);
    if (parsed instanceof Response) return parsed;

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    const challenge = consumeChallenge(cd.challenge, {
        userId: parsed.userId,
        purpose: 'register',
    });
    if (!challenge) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAttestation({
        response: parsed.credential as Parameters<typeof verifyAttestation>[0]['response'],
        expectedChallenge: challenge.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn attestation rejected', { code: result.code, user_id: parsed.userId });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    storeCredential({
        credentialId: result.credentialId,
        userId: parsed.userId,
        publicKeyCose: result.publicKeyCose,
        signCount: result.signCount,
        transports: result.transports.length > 0
            ? result.transports
            : parsed.credential.response.transports ?? [],
        createdAt: Date.now(),
        lastUsedAt: null,
        label: parsed.label,
    });

    log.info('webauthn credential registered', { user_id: parsed.userId, credential_id: result.credentialId });
    return c.json({ ok: true, credentialId: result.credentialId });
});

const loginBeginSchema = z.object({ userId: z.string().min(1) });

router.post('/login/begin', async (c) => {
    const status = requireEnabled();
    if (!status.ok) return c.json({ code: 'webauthn_disabled' }, 503);
    purgeExpiredChallenges();

    const parsed = await readJsonBody(c, loginBeginSchema);
    if (parsed instanceof Response) return parsed;

    const challenge = issueChallenge(parsed.userId, 'login');
    const allow = listCredentialsByUser(parsed.userId).map((c) => ({
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

    const stored = findCredential(parsed.credential.id);
    if (!stored || stored.userId !== parsed.userId) {
        return c.json({ code: 'unknown_credential' }, 400);
    }

    const cd = parseClientData(parsed.credential.response.clientDataJSON);
    if (!cd) return c.json({ code: 'malformed_client_data' }, 400);

    const challenge = consumeChallenge(cd.challenge, {
        userId: parsed.userId,
        purpose: 'login',
    });
    if (!challenge) return c.json({ code: 'challenge_invalid_or_expired' }, 400);

    const result = await verifyAssertion({
        response: parsed.credential as Parameters<typeof verifyAssertion>[0]['response'],
        expectedChallenge: challenge.challenge,
        config: status.cfg,
    });

    if (!result.ok) {
        log.warn('webauthn assertion rejected', { code: result.code, user_id: parsed.userId });
        return c.json({ code: result.code, detail: result.detail }, 400);
    }

    return c.json({ ok: true, credentialId: result.credentialId, signCount: result.signCount });
});

export default router;
