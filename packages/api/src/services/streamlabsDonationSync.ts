import { db } from '../db/store';
import { ensureFreshAccessToken } from './oauthProviders';
import {
  listDonations,
  type ListDonationsOptions,
  type ListDonationsOutcome,
} from '../integrations/streamlabs/api';
import { normalizeStreamlabsDonation } from '../integrations/streamlabs/donationEvents';
import { toWidgetAlertFromStreamlabs } from '../integrations/widgets/streamlabsShape';
import { publish as publishWidgetAlert } from './widgetBus';
import { log } from '../telemetry/logger';

/**
 * Streamlabs donation sync (Phase 1 / Track A monetization).
 *
 * For now this is a manual / on-demand sync: the creator (or a future
 * cron) calls `syncStreamlabsDonationsForUser(userId)`, the service
 * pulls recent donations from `/v1.0/donations`, dedups against the
 * persisted cursor (linked_accounts.sync_cursor), and publishes each
 * new one through the same widgetBus that EventSub + Patreon write to.
 * Connected OBS overlays fire unchanged.
 *
 * The cursor lives on the linked_accounts row so it survives restarts —
 * a cold boot picks up where the previous one left off.
 */

export interface SyncOptions extends Pick<ListDonationsOptions, 'fetch' | 'limit'> {
  /** Override the cursor for tests / first-run replays. */
  forceCursor?: string;
  /** Skip publishing — useful when reconciling at restart without spamming the bus. */
  dryRun?: boolean;
}

export type SyncOutcome =
  | {
      kind: 'ok';
      newDonations: number;
      latestDonationId?: string;
      delivered: number;
    }
  | { kind: 'no_link' }
  | { kind: 'token_unavailable'; reason: string }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

const compareIds = (a: string, b: string): number => {
  // Streamlabs donation ids are numeric strings; we compare numerically
  // when both parse, otherwise fall back to a stable lexicographic compare.
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return a < b ? -1 : a > b ? 1 : 0;
};

export const syncStreamlabsDonationsForUser = async (
  blackoutUserId: string,
  options: SyncOptions = {},
): Promise<SyncOutcome> => {
  const fresh = await ensureFreshAccessToken(blackoutUserId, 'streamlabs', {
    fetch: options.fetch,
  });
  if (fresh.kind === 'no_link' || fresh.kind === 'provider_not_implemented') {
    return { kind: 'no_link' };
  }
  if (fresh.kind === 'refresh_failed') {
    return { kind: 'token_unavailable', reason: `refresh_failed:${fresh.status}` };
  }
  if (fresh.kind === 'no_refresh_token' && !fresh.accessToken) {
    return { kind: 'token_unavailable', reason: 'no_token' };
  }
  const accessToken = fresh.accessToken;
  if (!accessToken) {
    return { kind: 'token_unavailable', reason: 'empty_token' };
  }

  const persistedCursor = db.getLinkedAccount(blackoutUserId, 'streamlabs')?.syncCursor;
  const cursor = options.forceCursor ?? persistedCursor;
  const apiOutcome: ListDonationsOutcome = await listDonations(accessToken, {
    after: cursor,
    limit: options.limit,
    fetch: options.fetch,
  });
  if (apiOutcome.kind === 'unauthorized') {
    log.warn('streamlabs_donation_sync_unauthorized', { blackoutUserId });
    return { kind: 'token_unavailable', reason: 'unauthorized' };
  }
  if (apiOutcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAfterSeconds: apiOutcome.retryAfterSeconds };
  }
  if (apiOutcome.kind === 'failed') {
    return { kind: 'failed', status: apiOutcome.status, detail: apiOutcome.detail };
  }

  // Sort ascending so we publish in chronological order, which is also
  // the order overlays expect to render alerts.
  const sorted = [...apiOutcome.donations].sort((a, b) =>
    compareIds(String(a.donation_id), String(b.donation_id)),
  );

  let delivered = 0;
  let latestDonationId = cursor;
  for (const raw of sorted) {
    const normalized = normalizeStreamlabsDonation(raw);
    if (!options.dryRun) {
      const alert = toWidgetAlertFromStreamlabs(normalized);
      const result = publishWidgetAlert(blackoutUserId, alert);
      delivered += result.delivered;
    }
    if (!latestDonationId || compareIds(normalized.donationId, latestDonationId) > 0) {
      latestDonationId = normalized.donationId;
    }
  }
  // Persist the cursor only when it actually advanced — saves a write on
  // empty-result polls and keeps `updated_at` meaningful. dryRun skips
  // the write so a backfill / preview doesn't leave the cursor in a
  // forward state without the corresponding alerts having been emitted.
  if (
    !options.dryRun &&
    latestDonationId !== undefined &&
    latestDonationId !== persistedCursor
  ) {
    db.setLinkedAccountSyncCursor(blackoutUserId, 'streamlabs', latestDonationId);
  }

  return {
    kind: 'ok',
    newDonations: sorted.length,
    latestDonationId,
    delivered,
  };
};

export const __test__ = { compareIds };

/**
 * Test reset hook. The cursor now lives on `linked_accounts.sync_cursor`
 * so the in-process map this used to clear is gone — the equivalent
 * cleanup is `db.linkedAccounts.clear()` (already done by per-test
 * loadModules). Kept as a no-op so existing test bootstraps don't
 * break.
 */
export const clearStreamlabsCursorsForTest = (): void => {
  /* no-op: cursor is now persisted on linked_accounts */
};
