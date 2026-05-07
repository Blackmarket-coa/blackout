/**
 * Tiny Streamlabs v1.0 REST client. Currently we need exactly one
 * endpoint — `GET /donations` — with optional cursor pagination via
 * `before` / `after` (Streamlabs takes Snowflake-style donation ids).
 *
 * Spec: https://dev.streamlabs.com/docs/donations
 */

const DONATIONS_URL = 'https://streamlabs.com/api/v1.0/donations';

export interface StreamlabsDonation {
  /** Streamlabs's per-donation id. Increases monotonically. */
  donation_id: string | number;
  /** Display name. May be empty for anonymous donors. */
  name: string;
  /** Decimal amount as a string per Streamlabs convention (e.g. "5.00"). */
  amount: string;
  currency: string;
  message: string;
  /** Unix epoch seconds (Streamlabs returns it as a number). */
  created_at: number;
}

export interface ListDonationsOptions {
  /** Return donations with id strictly greater than this cursor. */
  after?: string | number;
  /** Page size (Streamlabs caps at 100). */
  limit?: number;
  /** Pluggable fetch for tests. */
  fetch?: typeof fetch;
}

export type ListDonationsOutcome =
  | { kind: 'ok'; donations: StreamlabsDonation[] }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

/**
 * GET /donations with the linked Streamlabs account's user-OAuth token.
 * Returns a typed outcome so callers can decide how to react (refresh
 * token on 401, back off on 429, surface to the operator on 5xx).
 */
export const listDonations = async (
  accessToken: string,
  options: ListDonationsOptions = {},
): Promise<ListDonationsOutcome> => {
  const fetchFn = options.fetch ?? fetch;
  const params = new URLSearchParams({ access_token: accessToken });
  if (options.after !== undefined) params.set('after', String(options.after));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const res = await fetchFn(`${DONATIONS_URL}?${params.toString()}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
    };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { kind: 'failed', status: res.status, detail };
  }
  const json = (await res.json()) as { data?: StreamlabsDonation[] };
  return { kind: 'ok', donations: json.data ?? [] };
};
