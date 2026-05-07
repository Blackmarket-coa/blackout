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
 * in-process cursor, and publishes each new one through the same
 * widgetBus that EventSub + Patreon write to. Connected OBS overlays
 * fire unchanged.
 *
 * The cursor is in-process only for v1 (a Map keyed by Blackout user
 * id). On API restart we'll re-publish the most-recent donations once
 * — Streamlabs alert widgets dedup on `_id` so the visual effect is
 * "no double alerts" in practice. A persistent cursor lives in a
 * follow-up, probably as a column on `linked_accounts`.
 */

/** In-process cursor: max-seen donation id per Blackout user. */
const userCursors = new Map<string, string>();

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

  const cursor = options.forceCursor ?? userCursors.get(blackoutUserId);
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
  if (latestDonationId !== undefined) userCursors.set(blackoutUserId, latestDonationId);

  return {
    kind: 'ok',
    newDonations: sorted.length,
    latestDonationId,
    delivered,
  };
};

export const __test__ = { userCursors, compareIds };

/** Used by tests to reset the in-process cursor map between cases. */
export const clearStreamlabsCursorsForTest = (): void => {
  userCursors.clear();
};
