/**
 * The adapters that actually post to a platform.
 *
 * Until now there were none: `poster` defaulted to a stub that answered
 * `no_adapter`, so every platform the capabilities table marked `apiPost: true`
 * wrote a failed post row. The table was a claim about what those platforms
 * *permit*, not a record of anything built.
 *
 * Three rules shape what is here:
 *
 *  1. **Only what the platform sanctions.** Discord accepts an incoming webhook
 *     the coalition owns — no user token, no bot account, plainly allowed. An
 *     adapter that drove Discord with a member's user token would be
 *     self-botting, which is terminate-on-sight, so the connection layer
 *     refuses `personal` for Discord outright and no code here could do it.
 *     Bluesky app passwords and Mastodon application tokens are both the
 *     sanctioned automation credential for their platform. X permits posting
 *     under a paid developer agreement nobody has signed for this project, so
 *     there is deliberately no X adapter — `platformCanAutomate` reports false
 *     and the caller falls back to a share link a human completes.
 *  2. **The secret is read once, here, and never returned.** Credentials are
 *     stored as an encrypted envelope bound to the connection with AAD; this is
 *     the only module that decrypts them. Nothing in this file logs a credential
 *     or puts one in an error, and the failure strings are deliberately coarse
 *     for that reason.
 *  3. **A failure is a value, never a throw.** The caller records the outcome on
 *     a post row and moves to the next platform; one unreachable instance must
 *     not abort a cross-post to three others.
 */
import {
    COALITION_PLATFORM_CAPABILITIES,
    platformCanAutomate,
    type CoalitionPlatform,
} from '@blackout/core';
import { decryptSecret } from './secretBox';

const TIMEOUT_MS = 8_000;

export interface PostResult {
    ok: boolean;
    externalPostId?: string;
    error?: string;
}

/**
 * How a steward enters each platform's credential.
 *
 * Pipe-delimited because every field on the right can contain a colon (a
 * Mastodon instance URL) or a dash (a Bluesky app password), and a separator
 * that appears inside a value is a parse bug waiting for the first real token.
 */
export const CREDENTIAL_FORMATS: Partial<Record<CoalitionPlatform, string>> = {
    discord: 'The full webhook URL, from Server Settings → Integrations → Webhooks',
    bluesky: 'handle.bsky.social|app-password (create one in Settings → App Passwords)',
    mastodon: 'https://your.instance|access-token (Preferences → Development → New application)',
};

/** Validate the shape a steward pasted, before it is ever stored. */
export function credentialLooksValid(platform: CoalitionPlatform, secret: string): boolean {
    switch (platform) {
        case 'discord':
            // Narrowed to Discord's own webhook host so a steward who pastes a
            // bot token or an arbitrary URL is told now rather than at the
            // first post — and so this can never be pointed at a third party.
            return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(
                secret
            );
        case 'bluesky': {
            const [identifier, password] = secret.split('|');
            return Boolean(identifier && password && !identifier.includes('/'));
        }
        case 'mastodon': {
            const [instance, token] = secret.split('|');
            return Boolean(instance?.startsWith('https://') && token);
        }
        default:
            // Platforms with no adapter store nothing that gets parsed.
            return secret.length > 0;
    }
}

type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | undefined;

/** Test seam: swap the transport without standing up three real services. */
export function __setAdapterFetchForTests(impl: FetchImpl | undefined): void {
    fetchImpl = impl;
}

async function request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await (fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Discord — an incoming webhook the coalition owns
// ---------------------------------------------------------------------------

async function postToDiscord(webhookUrl: string, text: string): Promise<PostResult> {
    const res = await request(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text }),
    });
    if (!res.ok) return { ok: false, error: `discord_${res.status}` };
    // `wait=true` makes Discord return the created message, which is the only
    // way to get an id we can later reconcile inbound replies against.
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, ...(body?.id ? { externalPostId: body.id } : {}) };
}

// ---------------------------------------------------------------------------
// Bluesky — app password, session, then a post record
// ---------------------------------------------------------------------------

/**
 * Byte offsets of the URL inside the post text.
 *
 * Bluesky facets are indexed in UTF-8 bytes, not UTF-16 code units, so a
 * coalition name with an emoji in it shifts every offset a naive
 * `indexOf` would produce and the link silently stops being a link.
 */
function linkFacet(text: string, url: string): unknown[] | null {
    const index = text.indexOf(url);
    if (index < 0) return null;
    const encoder = new TextEncoder();
    const byteStart = encoder.encode(text.slice(0, index)).length;
    const byteEnd = byteStart + encoder.encode(url).length;
    return [
        {
            index: { byteStart, byteEnd },
            features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
        },
    ];
}

async function postToBluesky(
    credential: string,
    text: string,
    url: string,
    now: string
): Promise<PostResult> {
    const separator = credential.indexOf('|');
    if (separator < 0) return { ok: false, error: 'bluesky_credential_malformed' };
    const identifier = credential.slice(0, separator);
    const password = credential.slice(separator + 1);

    const session = await request('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
    });
    if (!session.ok) return { ok: false, error: `bluesky_auth_${session.status}` };
    const auth = (await session.json().catch(() => null)) as {
        accessJwt?: string;
        did?: string;
    } | null;
    if (!auth?.accessJwt || !auth.did) return { ok: false, error: 'bluesky_auth_malformed' };

    const facets = linkFacet(text, url);
    const res = await request('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${auth.accessJwt}`,
        },
        body: JSON.stringify({
            repo: auth.did,
            collection: 'app.bsky.feed.post',
            record: {
                $type: 'app.bsky.feed.post',
                text,
                createdAt: now,
                ...(facets ? { facets } : {}),
            },
        }),
    });
    if (!res.ok) return { ok: false, error: `bluesky_${res.status}` };
    const body = (await res.json().catch(() => null)) as { uri?: string } | null;
    return { ok: true, ...(body?.uri ? { externalPostId: body.uri } : {}) };
}

// ---------------------------------------------------------------------------
// Mastodon — an application access token on the member's own instance
// ---------------------------------------------------------------------------

async function postToMastodon(credential: string, text: string): Promise<PostResult> {
    const separator = credential.indexOf('|');
    if (separator < 0) return { ok: false, error: 'mastodon_credential_malformed' };
    const instance = credential.slice(0, separator).replace(/\/+$/, '');
    const token = credential.slice(separator + 1);
    if (!instance.startsWith('https://')) {
        return { ok: false, error: 'mastodon_instance_not_https' };
    }

    const res = await request(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            // Mastodon dedupes on this for 10 minutes, which turns a retry after
            // a timeout into a no-op instead of a second identical status.
            'idempotency-key': text.slice(0, 64),
        },
        body: JSON.stringify({ status: text, visibility: 'public' }),
    });
    if (!res.ok) return { ok: false, error: `mastodon_${res.status}` };
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, ...(body?.id ? { externalPostId: body.id } : {}) };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export interface AdapterInput {
    platform: CoalitionPlatform;
    text: string;
    url: string;
    credentialRef: string | null;
    /** AAD the credential was sealed with; decryption fails without the exact string. */
    credentialAad: string;
    now?: string;
}

/**
 * Post to one platform.
 *
 * Every failure path returns rather than throws, and no message carries any
 * part of a credential.
 */
export async function postToPlatform(input: AdapterInput): Promise<PostResult> {
    const capability = COALITION_PLATFORM_CAPABILITIES[input.platform];
    if (!capability.apiPost) return { ok: false, error: 'share_link_only' };
    if (!platformCanAutomate(input.platform)) {
        // The platform would allow this; we have not built it. Distinct from
        // `share_link_only` so a steward is not told Bluesky is impossible when
        // what is missing is an X developer agreement.
        return { ok: false, error: 'no_adapter' };
    }
    if (!input.credentialRef) return { ok: false, error: 'no_credential' };

    let secret: string;
    try {
        secret = decryptSecret(input.credentialRef, { aad: input.credentialAad });
    } catch {
        // Wrong key, rotated key, or a credential sealed against a different
        // connection. Never surface the underlying message: it names key ids.
        return { ok: false, error: 'credential_unreadable' };
    }

    const now = input.now ?? new Date().toISOString();
    try {
        switch (input.platform) {
            case 'discord':
                return await postToDiscord(secret, input.text);
            case 'bluesky':
                return await postToBluesky(secret, input.text, input.url, now);
            case 'mastodon':
                return await postToMastodon(secret, input.text);
            default:
                return { ok: false, error: 'no_adapter' };
        }
    } catch (error) {
        // A timeout aborts with an AbortError; everything else is a transport
        // failure. Both are "try again later", not "this post is invalid".
        return {
            ok: false,
            error: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'transport',
        };
    }
}

/** AAD for a coalition's own shared credential. Must match what sealed it. */
export const sharedCredentialAad = (coalitionId: string, platform: CoalitionPlatform): string =>
    `coalition_connection:${coalitionId}:${platform}`;

/** AAD for a member's personal credential. Must match what sealed it. */
export const memberCredentialAad = (
    coalitionId: string,
    userId: string,
    platform: CoalitionPlatform
): string => `coalition_member_connection:${coalitionId}:${userId}:${platform}`;
