import type { StreamlabsDonation } from './api';

/**
 * Normalized Streamlabs donation. The same `WidgetAlertEvent.source` slot
 * accepts this alongside Twitch + Patreon events; richer overlays read
 * `source.kind` to pick a renderer.
 */
export interface NormalizedStreamlabsDonation {
  kind: 'streamlabs_donation';
  /** Streamlabs's per-donation id, used for client-side dedup. */
  donationId: string;
  /** Display name. Defaults to "Anonymous" when Streamlabs returns an empty string. */
  donorName: string;
  /** Decimal amount as a string (e.g. "5.00"). */
  amount: string;
  currency: string;
  message: string;
  createdAtMs: number;
}

export const normalizeStreamlabsDonation = (
  raw: StreamlabsDonation,
): NormalizedStreamlabsDonation => ({
  kind: 'streamlabs_donation',
  donationId: String(raw.donation_id),
  donorName: raw.name?.trim() || 'Anonymous',
  amount: raw.amount,
  currency: raw.currency || 'USD',
  message: raw.message ?? '',
  createdAtMs: typeof raw.created_at === 'number' ? raw.created_at * 1000 : Date.now(),
});
