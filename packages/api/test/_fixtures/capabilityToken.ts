/**
 * A session token whose claims carry scopes a real one does not.
 *
 * Session tokens are minted by `signJwtWithMeta` with `deriveUserCapabilities()`
 * (`src/services/auth.ts`), and the `x-blackout-capabilities` header can only
 * narrow what a token grants (`src/modules/authz.ts`). Tests of a route behind
 * a scope that no session token carries (`governance.write`, `deadman.write`,
 * ...) need a caller that holds it: this signs a token the way
 * `signJwtWithMeta` does, with the API's own runtime config, carrying the
 * default capabilities plus `scopes`. Outside tests only an allowlisted admin
 * holds the admin-only scopes, and nobody holds `deadman.write`.
 *
 * Call it after the test file has set the JWT environment variables.
 */
import { createHmac, randomBytes } from 'node:crypto';
import {
    deriveUserCapabilities,
    readAuthRuntimeConfig,
    type AuthTokenPayload,
} from '../../src/services/auth';

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signJwtWithScopes(
    userId: string,
    username: string,
    scopes: readonly string[],
    ttlSeconds = 600
): string {
    const config = readAuthRuntimeConfig();
    const iat = Math.floor(Date.now() / 1000);
    const payload: AuthTokenPayload = {
        sub: userId,
        username,
        iat,
        exp: iat + ttlSeconds,
        iss: config.issuer,
        aud: config.audience,
        jti: randomBytes(16).toString('base64url'),
        capabilities: [...new Set([...deriveUserCapabilities(), ...scopes])],
    };
    const signingInput = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
    const signature = createHmac('sha256', config.signingSecret)
        .update(signingInput)
        .digest('base64url');
    return `${signingInput}.${signature}`;
}
