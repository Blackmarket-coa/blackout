import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

export interface AuthTokenPayload {
    sub: string;
    username: string;
    iat: number;
    exp: number;
    iss: string;
    aud: string;
    jti: string;
    /** Domain capabilities granted to this session, e.g. `streaming.read`.
     *  Optional so tokens issued before capability minting still verify. */
    capabilities?: string[];
    /**
     * Session end (epoch seconds) for a session with a server-enforced length
     * (the Black Mask panel's session-length choice, launch-plan B3). Present
     * only on such sessions; `exp` is never later than it, and verification
     * refuses the token from this second on.
     */
    sxp?: number;
}

const base64Url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

const WEAK_SECRET_PATTERNS = ['local-dev-secret', 'changeme', 'secret', 'dev-secret', 'password'];

export interface AuthRuntimeConfig {
    issuer: string;
    audience: string;
    signingSecret: string;
    verificationSecrets: string[];
    tokenTransport: 'header' | 'cookie' | 'both';
    cookieName?: string;
    cookieSecure?: boolean;
    cookieSameSite?: 'strict' | 'lax' | 'none';
}

const parseSecretList = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const isStrongSecret = (value: string): boolean => {
    if (value.length < 32) return false;
    const lowered = value.toLowerCase();
    if (WEAK_SECRET_PATTERNS.some((pattern) => lowered.includes(pattern))) return false;
    return (
        /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)
    );
};

let cachedConfig: AuthRuntimeConfig | null = null;

export const readAuthRuntimeConfig = (): AuthRuntimeConfig => {
    if (cachedConfig) return cachedConfig;

    const primarySecret =
        process.env.JWT_SECRET_PRIMARY?.trim() || process.env.JWT_SECRET?.trim() || '';
    const rolloverSecrets = parseSecretList(process.env.JWT_SECRET_ROLLOVER);
    const verificationSecrets = [primarySecret, ...rolloverSecrets].filter(Boolean);

    if (!primarySecret) {
        throw new Error('JWT secret missing: set JWT_SECRET_PRIMARY (or JWT_SECRET).');
    }
    if (!isStrongSecret(primarySecret)) {
        throw new Error(
            'JWT_SECRET_PRIMARY is weak. Use a high-entropy secret with mixed character classes and length >= 32.'
        );
    }
    rolloverSecrets.forEach((secret, index) => {
        if (!isStrongSecret(secret)) {
            throw new Error(
                `JWT_SECRET_ROLLOVER[${index}] is weak. Rotation keys must meet the same strength requirements.`
            );
        }
    });

    const issuer = process.env.JWT_ISSUER?.trim() || 'blackout-api';
    const audience = process.env.JWT_AUDIENCE?.trim() || 'blackout-clients';

    const tokenTransport =
        process.env.AUTH_TOKEN_TRANSPORT === 'cookie' || process.env.AUTH_TOKEN_TRANSPORT === 'both'
            ? process.env.AUTH_TOKEN_TRANSPORT
            : 'header';

    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || undefined;
    const cookieSecure = process.env.AUTH_COOKIE_SECURE === 'true';
    const cookieSameSiteRaw = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
    const cookieSameSite =
        cookieSameSiteRaw === 'strict' || cookieSameSiteRaw === 'none' ? cookieSameSiteRaw : 'lax';

    if (tokenTransport === 'cookie' || tokenTransport === 'both') {
        if (!cookieName) {
            throw new Error('Cookie token transport enabled but AUTH_COOKIE_NAME is missing.');
        }
        if (nodeEnv === 'production' && !cookieSecure) {
            throw new Error(
                'AUTH_COOKIE_SECURE must be true in production when cookie token transport is enabled.'
            );
        }
        if (cookieSameSite === 'none' && !cookieSecure) {
            throw new Error('AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true.');
        }
    }

    cachedConfig = {
        issuer,
        audience,
        signingSecret: primarySecret,
        verificationSecrets,
        tokenTransport,
        cookieName,
        cookieSecure,
        cookieSameSite,
    };
    return cachedConfig;
};

export const clearAuthRuntimeConfigCache = () => {
    cachedConfig = null;
};

export const MIN_PASSWORD_LENGTH = 8;

export function isAcceptablePassword(password: unknown): password is string {
    return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    const [salt, hashed] = stored.split(':');
    if (!salt || !hashed) return false;

    const candidate = scryptSync(password, salt, 64);
    const target = Buffer.from(hashed, 'hex');
    return candidate.length === target.length && timingSafeEqual(candidate, target);
}

// Precomputed so the "user not found" branch of login can spend the same
// scrypt work as the "wrong password" branch, preventing email enumeration
// via response-time measurement.
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));

export function verifyPasswordConstantTime(
    password: string,
    stored: string | undefined | null
): boolean {
    const target = stored && stored.includes(':') ? stored : DUMMY_PASSWORD_HASH;
    const ok = verifyPassword(password, target);
    return Boolean(stored) && ok;
}

// Async twins of the three helpers above: same scrypt parameters and the same
// `salt:hash` format, so a hash from either side verifies on the other. The
// difference is where the ~40 ms of scrypt work runs. The sync versions run it
// on the event loop, stalling every in-flight request: under load/k6/auth.js a
// token refresh, which does no hashing at all, waited ~0.6 s at p95 behind
// other users' registrations. These run it on the libuv threadpool instead.
//
// Request handlers should use these. Because they yield, anything a handler
// read before the await may have changed by the time it resumes: make state
// checks after the await, or repeat them there (see /register and /login in
// routes/auth.ts).
const scryptAsync = (password: string, salt: string, keylen: number): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
    });

export async function hashPasswordAsync(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scryptAsync(password, salt, 64)).toString('hex');
    return `${salt}:${hash}`;
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
    const [salt, hashed] = stored.split(':');
    if (!salt || !hashed) return false;

    const candidate = await scryptAsync(password, salt, 64);
    const target = Buffer.from(hashed, 'hex');
    return candidate.length === target.length && timingSafeEqual(candidate, target);
}

export async function verifyPasswordConstantTimeAsync(
    password: string,
    stored: string | undefined | null
): Promise<boolean> {
    const target = stored && stored.includes(':') ? stored : DUMMY_PASSWORD_HASH;
    const ok = await verifyPasswordAsync(password, target);
    return Boolean(stored) && ok;
}

/**
 * Comma-separated allowlist of admin usernames or full user ids. Shared by
 * the admin route gates and the admin-only capability scopes
 * (`ADMIN_ONLY_SCOPES` in `modules/authz.ts`) so "who is an admin" has a
 * single source of truth.
 */
export const adminAllowlist = (): Set<string> =>
    new Set(
        (process.env.BLACKOUT_ADMIN_USERS ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
    );

export const isAdminUser = (userId: string, username: string): boolean => {
    const allow = adminAllowlist();
    return allow.has(username) || allow.has(userId);
};

/**
 * Capabilities embedded in a freshly minted session token. Every authenticated
 * user gets read access to every guarded feature domain except `channels`,
 * plus write only where every route behind the scope checks per-resource
 * ownership or also takes an admin: `streaming.write` (per creator),
 * `profile.write` (`subject === userId`), `stego.write` (each account's own
 * channels) and `discovery.write` (listing a canopy takes being its admin on
 * the homeserver; the other discovery index writes also take an allowlisted
 * admin).
 *
 * Not minted: the write scopes whose routes change shared state with no
 * ownership or role check (governance, moderation, forum, channels, growth,
 * and dead drops, which can be addressed to any account), which only an
 * allowlisted admin holds (`ADMIN_ONLY_SCOPES` in `modules/authz.ts`), and
 * `deadman.write`, held back until it is decided whether the app may arm a
 * dead-man switch (N2 in
 * `docs/security/deadman-and-feeds-triage-2026-10-12.md`). The
 * `x-blackout-capabilities` header can only narrow this set.
 */
export function deriveUserCapabilities(): string[] {
    return [
        'streaming.read',
        'streaming.write',
        'profile.read',
        'profile.write',
        'governance.read',
        'forum.read',
        'deaddrop.read',
        'deadman.read',
        'moderation.read',
        'discovery.read',
        'discovery.write',
        'stego.read',
        'stego.write',
        'growth.read',
    ];
}

export interface SignedJwt {
    token: string;
    jti: string;
    exp: number;
}

export function signJwt(userId: string, username: string, ttlSeconds = 60 * 60 * 24): string {
    return signJwtWithMeta(userId, username, ttlSeconds).token;
}

export interface SignJwtOptions {
    /**
     * End of a session with a server-enforced length, in epoch seconds. The
     * token's `exp` is capped at it and it is carried as `sxp`. Callers must
     * refuse to mint for a session that has already ended.
     */
    sessionExpiresAt?: number;
}

export function signJwtWithMeta(
    userId: string,
    username: string,
    ttlSeconds = 60 * 60 * 24,
    options: SignJwtOptions = {}
): SignedJwt {
    const config = readAuthRuntimeConfig();
    const header = { alg: 'HS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const { sessionExpiresAt } = options;
    const bounded = typeof sessionExpiresAt === 'number';
    const exp = bounded ? Math.min(iat + ttlSeconds, sessionExpiresAt) : iat + ttlSeconds;
    const jti = randomBytes(16).toString('base64url');
    const payload: AuthTokenPayload = {
        sub: userId,
        username,
        iat,
        exp,
        iss: config.issuer,
        aud: config.audience,
        jti,
        capabilities: deriveUserCapabilities(),
        ...(bounded ? { sxp: sessionExpiresAt } : {}),
    };

    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', config.signingSecret)
        .update(signingInput)
        .digest('base64url');
    return { token: `${signingInput}.${signature}`, jti, exp };
}

export function verifyJwt(token: string): AuthTokenPayload | null {
    const config = readAuthRuntimeConfig();
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const signingInput = `${header}.${payload}`;

    // Defense-in-depth: pin the algorithm from the JWT header to HS256 before
    // verifying. Signature verification below is hardcoded to HMAC-SHA256 with
    // the server secret regardless of the header, so this is not currently
    // exploitable — but rejecting `none`/RS256/etc. here closes the door on
    // algorithm-confusion should a future refactor ever select the algorithm
    // from the (attacker-controlled) header.
    let headerAlg: unknown;
    try {
        headerAlg = (
            JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown }
        ).alg;
    } catch {
        return null;
    }
    if (headerAlg !== 'HS256') return null;

    const validSignature = config.verificationSecrets.some((secret) => {
        const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        return (
            signatureBuffer.length === expectedBuffer.length &&
            timingSafeEqual(signatureBuffer, expectedBuffer)
        );
    });

    if (!validSignature) return null;

    let decoded: AuthTokenPayload;
    try {
        decoded = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        ) as AuthTokenPayload;
    } catch {
        return null;
    }
    if (typeof decoded?.exp !== 'number' || typeof decoded?.iat !== 'number') return null;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;
    // A session with a server-enforced length ends at `sxp`, whatever `exp`
    // says (it is minted no later, but the check must not depend on that).
    if (decoded.sxp !== undefined && (typeof decoded.sxp !== 'number' || decoded.sxp <= now)) {
        return null;
    }
    if (decoded.iss !== config.issuer || decoded.aud !== config.audience) return null;

    return decoded;
}
