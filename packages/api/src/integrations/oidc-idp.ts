import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { withTimeout } from './http';

/**
 * MAS-facing OIDC client for the native delegated login (W2, consolidation
 * D4): `/v1/auth/oidc/begin` builds an authorization URL from the issuer's
 * discovery document; `/v1/auth/oidc/continue` exchanges the code and
 * verifies the id_token here.
 *
 * Shaped like `integrations/matrix-client.ts`: a singleton whose methods
 * tests stub by reassignment. Deliberately NOT part of
 * `integrations/_oauth/providerFlow.ts` — that flow's contract is
 * link-to-an-existing-user (its pending table requires a user id and it has
 * no id_token/nonce semantics); login has no user yet. The PKCE/state
 * primitives mirror providerFlow's, and the pending state lives in
 * `pending_oidc_logins` (db/store, migration 083).
 *
 * Claim semantics (docs/contracts/mas-identity.md): `sub` is the MAS account
 * ULID — stable but NEVER a Matrix localpart; the localpart travels in
 * `preferred_username` (id_token under the `profile` scope, else userinfo).
 *
 * Note: enabling OIDC login also requires LINKED_ACCOUNT_ENCRYPTION_KEYS
 * (the PKCE verifier at rest uses the same secretBox envelope as linked
 * accounts) — acceptable because the whole surface is env-gated.
 */

export interface OidcRuntimeConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** Exact-match allowlist for caller-supplied redirect URIs. */
    redirectAllowlist: string[];
    scopes: string;
}

export interface OidcDiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    userinfo_endpoint?: string;
    id_token_signing_alg_values_supported?: string[];
}

export interface OidcTokenResponse {
    access_token?: string;
    id_token?: string;
    token_type?: string;
    expires_in?: number;
}

const normalizeIssuer = (raw: string): string => raw.replace(/\/+$/, '');

export const readOidcRuntimeConfig = (): OidcRuntimeConfig | null => {
    const issuer = process.env.BLACKOUT_OIDC_ISSUER?.trim();
    const clientId = process.env.BLACKOUT_OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.BLACKOUT_OIDC_CLIENT_SECRET?.trim();
    const allowlistRaw = process.env.BLACKOUT_OIDC_REDIRECT_ALLOWLIST?.trim();
    if (!issuer || !clientId || !clientSecret || !allowlistRaw) return null;
    const redirectAllowlist = allowlistRaw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    if (redirectAllowlist.length === 0) return null;
    return {
        issuer: normalizeIssuer(issuer),
        clientId,
        clientSecret,
        redirectAllowlist,
        scopes: process.env.BLACKOUT_OIDC_SCOPES?.trim() || 'openid profile',
    };
};

export const isOidcLoginConfigured = (): boolean => readOidcRuntimeConfig() !== null;

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

interface DiscoveryCacheEntry {
    issuer: string;
    document: OidcDiscoveryDocument;
    fetchedAt: number;
}

let discoveryCache: DiscoveryCacheEntry | undefined;
let discoveryInFlight: Promise<OidcDiscoveryDocument> | undefined;
// jose JWKS resolvers cache keys internally; keep one per jwks_uri.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const jwksFor = (jwksUri: string): ReturnType<typeof createRemoteJWKSet> => {
    let set = jwksCache.get(jwksUri);
    if (!set) {
        set = createRemoteJWKSet(new URL(jwksUri));
        jwksCache.set(jwksUri, set);
    }
    return set;
};

export const oidcIdp = {
    /**
     * Fetch (and cache ~1 h, with in-flight dedupe) the issuer's
     * openid-configuration. Throws when unconfigured or on a malformed
     * document; the issuer echo is validated per OIDC Discovery §4.3.
     */
    async discover(): Promise<OidcDiscoveryDocument> {
        const config = readOidcRuntimeConfig();
        if (!config) throw new Error('oidc_not_configured');
        if (
            discoveryCache &&
            discoveryCache.issuer === config.issuer &&
            Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS
        ) {
            return discoveryCache.document;
        }
        if (discoveryInFlight) return discoveryInFlight;
        const fetchFn = withTimeout(fetch);
        discoveryInFlight = (async () => {
            try {
                const res = await fetchFn(`${config.issuer}/.well-known/openid-configuration`);
                if (!res.ok) {
                    throw new Error(`oidc discovery failed: ${res.status}`);
                }
                const doc = (await res.json()) as OidcDiscoveryDocument;
                if (
                    !doc.authorization_endpoint ||
                    !doc.token_endpoint ||
                    !doc.jwks_uri ||
                    typeof doc.issuer !== 'string'
                ) {
                    throw new Error('oidc discovery document incomplete');
                }
                if (normalizeIssuer(doc.issuer) !== config.issuer) {
                    throw new Error(
                        `oidc discovery issuer mismatch: expected ${config.issuer}, got ${doc.issuer}`
                    );
                }
                discoveryCache = { issuer: config.issuer, document: doc, fetchedAt: Date.now() };
                return doc;
            } finally {
                discoveryInFlight = undefined;
            }
        })();
        return discoveryInFlight;
    },

    /** Authorization-code + PKCE exchange at the discovered token endpoint. */
    async exchangeCode(params: {
        code: string;
        redirectUri: string;
        codeVerifier: string;
    }): Promise<OidcTokenResponse> {
        const config = readOidcRuntimeConfig();
        if (!config) throw new Error('oidc_not_configured');
        const discovery = await oidcIdp.discover();
        const fetchFn = withTimeout(fetch);
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: params.code,
            redirect_uri: params.redirectUri,
            code_verifier: params.codeVerifier,
        });
        const res = await fetchFn(discovery.token_endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`oidc token exchange failed: ${res.status} ${detail.slice(0, 200)}`);
        }
        return (await res.json()) as OidcTokenResponse;
    },

    /**
     * Verify an id_token against the issuer's JWKS (signature, iss, aud, exp
     * via jose) and bind it to the transaction's nonce. Returns the claims.
     */
    async verifyIdToken(params: { idToken: string; nonce: string }): Promise<JWTPayload> {
        const config = readOidcRuntimeConfig();
        if (!config) throw new Error('oidc_not_configured');
        const discovery = await oidcIdp.discover();
        const { payload } = await jwtVerify(params.idToken, jwksFor(discovery.jwks_uri), {
            issuer: discovery.issuer,
            audience: config.clientId,
            algorithms: discovery.id_token_signing_alg_values_supported,
        });
        if (payload.nonce !== params.nonce) {
            throw new Error('oidc id_token nonce mismatch');
        }
        return payload;
    },

    /**
     * Userinfo fallback for deployments where `preferred_username` is not in
     * the id_token. Returns the claims object, or null when the issuer has no
     * userinfo endpoint.
     */
    async fetchUserinfo(accessToken: string): Promise<Record<string, unknown> | null> {
        const discovery = await oidcIdp.discover();
        if (!discovery.userinfo_endpoint) return null;
        const fetchFn = withTimeout(fetch);
        const res = await fetchFn(discovery.userinfo_endpoint, {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
            throw new Error(`oidc userinfo failed: ${res.status}`);
        }
        return (await res.json()) as Record<string, unknown>;
    },

    /** Test hook: drop the discovery + JWKS caches. */
    resetCachesForTests(): void {
        discoveryCache = undefined;
        discoveryInFlight = undefined;
        jwksCache.clear();
    },
};
