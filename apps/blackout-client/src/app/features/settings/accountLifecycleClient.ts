import { API_BASE_URL, createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const ACCOUNT_BASE = '/v1/auth/account';
const EMAIL_VERIFY_BASE = '/v1/auth/email/verify';

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
  moderationActions: Array<{ id: string; communityId: string; action: string; reason: string; createdAt: string }>;
  refreshTokensCount: number;
  passwordResetTokensCount: number;
  emailVerificationTokensCount: number;
}

/** Fetch the user's data export and trigger a JSON download in the browser. */
export async function downloadAccountExport(token: string | null = readBlackoutApiToken()): Promise<AccountExport> {
  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE_URL}${ACCOUNT_BASE}/export`, { headers });
  if (!res.ok) {
    throw new Error(`account_export_failed:${res.status}`);
  }
  const data = (await res.json()) as AccountExport;
  // Best-effort browser download; safe-no-op if running outside a browser
  // (e.g. unit tests using node fetch).
  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `blackout-export-${data.user.id}-${data.exportedAt}.json`;
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
  token: string | null = readBlackoutApiToken(),
): Promise<DeleteRequestResponse> {
  return createAuthorizedApiClient(token)({
    method: 'POST',
    path: `${ACCOUNT_BASE}/delete/request`,
    body: {},
  }) as Promise<DeleteRequestResponse>;
}

export async function confirmAccountDeletion(
  confirmationToken: string,
  token: string | null = readBlackoutApiToken(),
): Promise<{ ok: true }> {
  return createAuthorizedApiClient(token)({
    method: 'POST',
    path: `${ACCOUNT_BASE}/delete/confirm`,
    body: { token: confirmationToken },
  }) as Promise<{ ok: true }>;
}

export async function requestEmailVerification(
  token: string | null = readBlackoutApiToken(),
): Promise<{ ok: true; alreadyVerified?: boolean }> {
  return createAuthorizedApiClient(token)({
    method: 'POST',
    path: `${EMAIL_VERIFY_BASE}/request`,
    body: {},
  }) as Promise<{ ok: true; alreadyVerified?: boolean }>;
}

export async function confirmEmailVerification(
  verificationToken: string,
  token: string | null = readBlackoutApiToken(),
): Promise<{ ok: true; userId: string; emailVerifiedAt: string }> {
  return createAuthorizedApiClient(token)({
    method: 'POST',
    path: `${EMAIL_VERIFY_BASE}/confirm`,
    body: { token: verificationToken },
  }) as Promise<{ ok: true; userId: string; emailVerifiedAt: string }>;
}
