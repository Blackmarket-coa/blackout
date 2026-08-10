import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const ACCOUNT_BASE = '/v1/auth/account';
const EMAIL_VERIFY_BASE = '/v1/auth/email/verify';
const DATA_EXPORT_PATH = '/v1/data-export';

/**
 * The account slice of the export — what `/v1/auth/account/export` returned on
 * its own, and what `/v1/data-export` now nests under `account`.
 */
export interface AccountExport {
    exportedAt: string;
    schemaVersion: 1;
    user: {
        id: string;
        username: string;
        email: string;
        reputationScore: number;
        reputationTier: string;
        pubkeyEd25519: string;
        createdAt: string;
        emailVerifiedAt?: string;
    };
    linkedAccounts: Array<{
        provider: string;
        providerUserId: string;
        providerUsername?: string;
        scopes: string[];
        createdAt: string;
        updatedAt: string;
    }>;
    votes: Array<{ id: string; communityId: string; title: string; createdAt: string }>;
    voteEntries: Array<{ id: string; voteId: string; choice: string; createdAt: string }>;
    forumPosts: Array<{ id: string; communityId: string; title: string; createdAt: string }>;
    messages: Array<{ id: string; channelId: string; createdAt: string }>;
    deadDrops: Array<{ id: string; channelId: string; createdAt: string; openedAt?: string }>;
    moderationActions: Array<{
        id: string;
        communityId: string;
        action: string;
        reason: string;
        createdAt: string;
    }>;
    refreshTokensCount: number;
    passwordResetTokensCount: number;
    emailVerificationTokensCount: number;
}

/**
 * The full self-service export returned by `GET /v1/data-export`. Free at every
 * tier, and split by system of record — see docs/features/data-export.md.
 */
export interface DataExport {
    manifest: {
        schema: 'blackout.data-export.v1';
        generatedAt: string;
        userId: string;
        /** Encrypted message content is absent by design; the payload explains why. */
        matrixHistory: { included: false; reason: string; howToExport: string };
        excluded: string[];
    };
    account: AccountExport;
    socialGraph: Record<string, unknown>;
    ledger: Record<string, unknown>;
}

/**
 * Fetch the user's data export and trigger a JSON download in the browser.
 *
 * This calls `/v1/data-export`, not the older `/v1/auth/account/export`. The
 * settings button used to hand people the older endpoint's ~10-table payload
 * while the comprehensive export was reachable only by curl — so the UI was
 * quietly serving the weaker of the two. The old endpoint still exists for
 * API consumers; nothing in the client points at it any more.
 */
export async function downloadDataExport(
    token: string | null = readBlackoutApiToken()
): Promise<DataExport> {
    const data = (await createAuthorizedApiClient(token)({
        method: 'GET',
        path: DATA_EXPORT_PATH,
    })) as DataExport;
    // Best-effort browser download; safe-no-op if running outside a browser
    // (e.g. unit tests using node fetch).
    if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `blackout-export-${data.manifest.userId}-${data.manifest.generatedAt}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }
    return data;
}

export interface DeleteRequestResponse {
    ok: true;
    expiresAt: string;
}

export async function requestAccountDeletion(
    token: string | null = readBlackoutApiToken()
): Promise<DeleteRequestResponse> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: `${ACCOUNT_BASE}/delete/request`,
        body: {},
    }) as Promise<DeleteRequestResponse>;
}

export async function confirmAccountDeletion(
    confirmationToken: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true }> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: `${ACCOUNT_BASE}/delete/confirm`,
        body: { token: confirmationToken },
    }) as Promise<{ ok: true }>;
}

export async function requestEmailVerification(
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true; alreadyVerified?: boolean }> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: `${EMAIL_VERIFY_BASE}/request`,
        body: {},
    }) as Promise<{ ok: true; alreadyVerified?: boolean }>;
}

export async function confirmEmailVerification(
    verificationToken: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true; userId: string; emailVerifiedAt: string }> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: `${EMAIL_VERIFY_BASE}/confirm`,
        body: { token: verificationToken },
    }) as Promise<{ ok: true; userId: string; emailVerifiedAt: string }>;
}
