import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import type { AuthSessionContinuedEvent } from '@blackout/protocol';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { isOidcLoginConfigured, oidcIdp, readOidcRuntimeConfig } from '../integrations/oidc-idp';
import {
    decryptSecret,
    encryptSecret,
    envelopeKeyId,
    readSecretBoxConfig,
} from '../services/secretBox';
import {
    issueSession,
    matrixExchangeProvisioningTrusted,
    matrixHomeserverDomain,
    MATRIX_LOCALPART_RE,
} from './auth';
import { log } from '../telemetry/logger';
import { authFailuresTotal } from '../telemetry/metrics';

/**
 * Native OIDC login against MAS (W2, consolidation D4) — fills the
 * `/v1/auth/oidc/begin` + `/continue` routes the SDK
 * (`packages/blackout-sdk/src/auth-threads/actions.ts`) and the client's
 * `AuthDelegatedLoginPage` already call.
 *
 * Flow: `begin` mints state/nonce/PKCE, persists a single-use
 * `pending_oidc_logins` row (10-min TTL; hashes only — see migration 083)
 * and returns the MAS authorization URL. `continue` consumes the state,
 * exchanges the code, verifies the id_token (jose: JWKS/iss/aud + nonce),
 * maps `preferred_username` → localpart → Blackout user (provision-on-miss
 * under the SAME trust flag as /matrix/exchange), and mints the same local
 * session. Retiring the local JWT itself is a later workstream — see
 * docs/contracts/mas-identity.md#migration.
 *
 * Dark by default: every route 503s (`oidc_not_configured`) until
 * BLACKOUT_OIDC_{ISSUER,CLIENT_ID,CLIENT_SECRET,REDIRECT_ALLOWLIST} are set.
 */

const PENDING_TTL_SECONDS = 10 * 60;
const STATE_BYTES = 32;
const NONCE_BYTES = 32;
const VERIFIER_BYTES = 64;

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');
const b64url = (input: Buffer): string => input.toString('base64url');
const codeChallengeS256 = (verifier: string): string =>
    b64url(createHash('sha256').update(verifier).digest());
const aadForPendingLogin = (stateHash: string): string => `pending_oidc_login:${stateHash}`;

const authOidc = new Hono();

const beginSchema = z.object({
    redirectUri: z.string().min(1).max(2048),
    scopes: z.array(z.string().min(1).max(64)).max(16).optional(),
});

authOidc.post('/begin', async (c) => {
    const config = readOidcRuntimeConfig();
    if (!config) {
        return c.json(
            { code: 'oidc_not_configured', message: 'OIDC delegated login is not configured' },
            503
        );
    }
    const parsed = await readJsonBody(c, beginSchema);
    if (parsed instanceof Response) return parsed;

    // The caller-supplied redirect is why the allowlist exists (exact match;
    // MAS additionally enforces its own registered redirect_uris).
    if (!config.redirectAllowlist.includes(parsed.redirectUri)) {
        authFailuresTotal.inc({ reason: 'oidc_redirect_uri_not_allowed' });
        return c.json(
            {
                code: 'oidc_redirect_uri_not_allowed',
                message: 'redirectUri is not in the configured allowlist',
            },
            400
        );
    }

    // Surface missing secretBox config before persisting a row that could
    // never complete (same early-throw providerFlow.beginFlow does).
    readSecretBoxConfig();

    let discovery;
    try {
        discovery = await oidcIdp.discover();
    } catch (error) {
        log.warn('oidc_discovery_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json(
            { code: 'oidc_issuer_unavailable', message: 'The OIDC issuer is unreachable' },
            502
        );
    }

    const state = b64url(randomBytes(STATE_BYTES));
    const nonce = b64url(randomBytes(NONCE_BYTES));
    const verifier = b64url(randomBytes(VERIFIER_BYTES));
    const stateHash = sha256Hex(state);
    const codeVerifierCiphertext = encryptSecret(verifier, {
        aad: aadForPendingLogin(stateHash),
    });
    const scopes = parsed.scopes?.length ? parsed.scopes : config.scopes.split(' ');

    db.createPendingOidcLogin({
        stateHash,
        nonceHash: sha256Hex(nonce),
        codeVerifierCiphertext,
        redirectUri: parsed.redirectUri,
        encryptionKeyId: envelopeKeyId(codeVerifierCiphertext),
        expiresAt: new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString(),
    });

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: parsed.redirectUri,
        scope: scopes.join(' '),
        state,
        nonce,
        code_challenge: codeChallengeS256(verifier),
        code_challenge_method: 'S256',
    });

    return c.json({
        authorizationUrl: `${discovery.authorization_endpoint}?${params.toString()}`,
        state,
        scopes,
    });
});

const continueSchema = z.object({
    reason: z.enum(['login', 'refresh', 'idp_handoff']),
    code: z.string().min(1).max(4096).optional(),
    state: z.string().min(1).max(1024).optional(),
    idToken: z.string().max(16384).optional(),
});

const sessionEnvelope = (payload: AuthSessionContinuedEvent['payload']) => {
    const event: AuthSessionContinuedEvent = {
        event: 'blackout.auth.session.continued',
        roomId: '',
        senderId: payload.subject,
        occurredAt: new Date().toISOString(),
        payload,
    };
    return event;
};

authOidc.post('/continue', async (c) => {
    if (!isOidcLoginConfigured()) {
        return c.json(
            { code: 'oidc_not_configured', message: 'OIDC delegated login is not configured' },
            503
        );
    }
    const parsed = await readJsonBody(c, continueSchema);
    if (parsed instanceof Response) return parsed;
    const config = readOidcRuntimeConfig()!;

    // `refresh` describes the CURRENT session; no IdP round-trip. This is what
    // the shipped AuthDelegatedLoginPage "Refresh session" button calls.
    if (parsed.reason === 'refresh') {
        const userOrResp = requireUser(c, 'Sign in to refresh the session');
        if (userOrResp instanceof Response) return userOrResp;
        const user = userOrResp;
        return c.json(
            sessionEnvelope({
                subject: `@${user.username}:${matrixHomeserverDomain()}`,
                issuer: config.issuer,
                issuedAt: new Date(user.iat * 1000).toISOString(),
                expiresAt: new Date(user.exp * 1000).toISOString(),
                reason: 'refresh',
            })
        );
    }

    // A bare id_token has no nonce bound to a transaction WE minted, so it is
    // replayable — the field stays reserved until a sound binding exists.
    if (!parsed.code || !parsed.state) {
        if (parsed.idToken) {
            return c.json(
                {
                    code: 'oidc_id_token_unsupported',
                    message: 'Direct id_token continuation is not supported; use code + state',
                },
                400
            );
        }
        return c.json(
            { code: 'bad_request', message: 'code and state are required for this reason' },
            400
        );
    }

    // Single-use, TTL-checked consume; ownership = presenting the plaintext state.
    const pending = db.consumePendingOidcLogin(sha256Hex(parsed.state));
    if (!pending) {
        authFailuresTotal.inc({ reason: 'oidc_state_invalid' });
        return c.json(
            { code: 'oidc_state_invalid', message: 'Login state is invalid, expired, or reused' },
            401
        );
    }

    let verifier: string;
    try {
        verifier = decryptSecret(pending.codeVerifierCiphertext, {
            aad: aadForPendingLogin(pending.stateHash),
        });
    } catch {
        authFailuresTotal.inc({ reason: 'oidc_state_invalid' });
        return c.json(
            { code: 'oidc_state_invalid', message: 'Login state is invalid, expired, or reused' },
            401
        );
    }

    let claims;
    let accessToken: string | undefined;
    try {
        const tokens = await oidcIdp.exchangeCode({
            code: parsed.code,
            redirectUri: pending.redirectUri,
            codeVerifier: verifier,
        });
        if (!tokens.id_token) throw new Error('token response missing id_token');
        accessToken = tokens.access_token;
        // The pending row holds only the nonce's hash. Read the (unverified)
        // nonce claim, check it hash-binds to THIS transaction, then run the
        // full jose verification (signature/iss/aud/exp) with that nonce —
        // the verified claim is transitively bound through the equality check
        // inside verifyIdToken.
        const unverifiedNonce = decodeJwt(tokens.id_token).nonce;
        if (typeof unverifiedNonce !== 'string' || !unverifiedNonce) {
            throw new Error('id_token missing nonce');
        }
        if (sha256Hex(unverifiedNonce) !== pending.nonceHash) {
            throw new Error('id_token nonce does not match this login transaction');
        }
        claims = await oidcIdp.verifyIdToken({
            idToken: tokens.id_token,
            nonce: unverifiedNonce,
        });
    } catch (error) {
        authFailuresTotal.inc({ reason: 'oidc_token_invalid' });
        log.warn('oidc_continue_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json(
            { code: 'oidc_token_invalid', message: 'OIDC token exchange or verification failed' },
            401
        );
    }

    // Claim → user mapping: `preferred_username` is the Matrix localpart
    // (`sub` is the MAS account ULID — never a localpart). Fall back to
    // userinfo when the id_token omits it.
    let preferred = typeof claims.preferred_username === 'string' ? claims.preferred_username : '';
    if (!preferred && accessToken) {
        try {
            const userinfo = await oidcIdp.fetchUserinfo(accessToken);
            const fromUserinfo = userinfo?.['preferred_username'];
            if (typeof fromUserinfo === 'string') preferred = fromUserinfo;
        } catch (error) {
            log.warn('oidc_userinfo_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    // Defensive: accept a full mxid shape and reduce it, like /matrix/exchange
    // does for whoami results.
    const localpart = preferred.replace(/^@/, '').split(':')[0] ?? '';
    if (!localpart || !MATRIX_LOCALPART_RE.test(localpart)) {
        authFailuresTotal.inc({ reason: 'oidc_claims_missing' });
        return c.json(
            {
                code: 'oidc_claims_missing',
                message: 'The IdP did not supply a usable preferred_username',
            },
            401
        );
    }

    let user = db.findUserByUsername(localpart);
    if (!user) {
        // Same trust assertion as /matrix/exchange: accounts on this issuer
        // are Blackout-exclusive. One flag, one policy, one error code.
        if (!matrixExchangeProvisioningTrusted()) {
            authFailuresTotal.inc({ reason: 'matrix_exchange_provisioning_disabled' });
            return c.json(
                {
                    code: 'matrix_exchange_provisioning_disabled',
                    message:
                        'No linked Blackout account for this identity; exchange-based provisioning is disabled',
                },
                403
            );
        }
        user = db.createUser({
            id: randomUUID(),
            username: localpart,
            passwordHash: '',
            reputationScore: 0,
            reputationTier: 'member',
            pubkeyEd25519: randomUUID().replace(/-/g, ''),
        });
    }

    const session = issueSession(user.id, user.username, c.req.header('user-agent'));
    const envelope = sessionEnvelope({
        subject: `@${user.username}:${matrixHomeserverDomain()}`,
        issuer: config.issuer,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(session.access.exp * 1000).toISOString(),
        reason: parsed.reason,
    });
    // Additive `session` so callers can store the local JWT (the SDK response
    // type carries it as an optional field).
    return c.json({
        ...envelope,
        session: {
            token: session.access.token,
            refreshToken: session.refresh.token,
            userId: user.id,
        },
    });
});

export default authOidc;
