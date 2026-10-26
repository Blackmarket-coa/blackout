import { createHmac } from 'node:crypto';

const base64Url = (value: string) => Buffer.from(value).toString('base64url');

export type VoiceRole = 'member' | 'moderator' | 'admin';

/**
 * How long a LiveKit access token the API mints is valid, in seconds.
 *
 * LiveKit checks a token when a client connects; a participant who is
 * connected stays connected until removed, whatever the token says by then.
 * So the TTL bounds how long a token the API minted before a lock, a mute or a
 * removal can still open a connection with the role and the permissions it was
 * minted with (V4 in `docs/security/capability-header-triage-2026-10-23.md`).
 * Two minutes leaves time to fetch the token, connect, and retry a first
 * connection that failed or dropped; it is a judgement, not a measurement.
 *
 * It is not a revocation. A token already issued stays valid until it expires,
 * and LiveKit's signal protocol lets the server hand a connected client a
 * refreshed token (`refresh_token`), whose lifetime the LiveKit server sets and
 * the API cannot shorten. So a removed participant whose client kept a valid
 * token can rejoin the LiveKit room with it until it expires (the SDK's
 * `removeParticipant`: "the participant can still re-join the room"); the API
 * refuses that account any new token. One constant on purpose: neither the
 * environment (`LIVEKIT_TOKEN_TTL_SECONDS` used to allow up to 15 minutes) nor
 * the request (`ttlSeconds`) can lengthen it.
 */
export const LIVEKIT_TOKEN_TTL_SECONDS = 120;

export interface LiveKitTokenRequest {
    identity: string;
    name: string;
    roomName: string;
    role: VoiceRole;
    canPublish: boolean;
    canSubscribe: boolean;
}

const LIVEKIT_ENV = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required LiveKit environment variable: ${name}`);
    }
    return value;
}

/**
 * Whether LiveKit is configured: URL, API key and API secret all set. Read on
 * every call and never throws, so a route can answer 503 instead of failing.
 */
export function isLiveKitConfigured(): boolean {
    return LIVEKIT_ENV.every((name) => Boolean(process.env[name]?.trim()));
}

export function getLiveKitConfig() {
    const url = requiredEnv('LIVEKIT_URL');
    const apiKey = requiredEnv('LIVEKIT_API_KEY');
    const apiSecret = requiredEnv('LIVEKIT_API_SECRET');
    return { url, apiKey, apiSecret, tokenTtlSeconds: LIVEKIT_TOKEN_TTL_SECONDS };
}

export function createLiveKitAccessToken(input: LiveKitTokenRequest): {
    token: string;
    expiresAt: string;
    apiKey: string;
} {
    const config = getLiveKitConfig();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + LIVEKIT_TOKEN_TTL_SECONDS;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        iss: config.apiKey,
        sub: input.identity,
        iat,
        exp,
        nbf: iat,
        name: input.name,
        metadata: JSON.stringify({ role: input.role }),
        video: {
            roomJoin: true,
            room: input.roomName,
            canPublish: input.canPublish,
            canSubscribe: input.canSubscribe,
            canPublishData: true,
        },
    };

    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', config.apiSecret).update(data).digest('base64url');

    return {
        token: `${data}.${signature}`,
        expiresAt: new Date(exp * 1000).toISOString(),
        apiKey: config.apiKey,
    };
}
