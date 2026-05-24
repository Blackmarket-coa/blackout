/**
 * Tenor v2 API client. Used by `routes/tenor.ts` to proxy GIF search and
 * trending requests so the API key stays server-side and per-user
 * `client_key` is generated from the authenticated Blackout user id.
 *
 * Tenor v2 API reference: https://developers.google.com/tenor/guides/quickstart
 *
 * Required env: `TENOR_API_KEY`. Without it the proxy returns 503 and the
 * client renders the existing "No GIF Packs!" empty state.
 */

const TENOR_BASE = 'https://tenor.googleapis.com/v2';

// Tenor returns many `media_formats` variants; we only need two: the full
// GIF for sending, and the tiny preview for the picker grid.
const MEDIA_FILTER = 'gif,tinygif';

export type TenorContentFilter = 'off' | 'low' | 'medium' | 'high';

export interface TenorMediaFormat {
  url: string;
  /** [width, height] in pixels. */
  dims: [number, number];
  /** Duration in seconds (0 for stills). */
  duration?: number;
  /** Byte size of the file. */
  size?: number;
}

export interface TenorResult {
  id: string;
  title: string;
  content_description: string;
  media_formats: Partial<Record<'gif' | 'tinygif', TenorMediaFormat>>;
}

export interface TenorListResponse {
  results: TenorResult[];
  next: string;
}

export interface TenorClientConfig {
  apiKey: string;
  /** Per-user pseudonymous id to improve Tenor's relevance ranking. */
  clientKey?: string;
  /** Default: 'medium'. */
  contentFilter?: TenorContentFilter;
  /** Default: 20. Tenor allows 1..50. */
  defaultLimit?: number;
  /** ISO-639-1 + optional region, e.g. "en_US". */
  locale?: string;
  fetchFn?: typeof fetch;
}

export interface TenorSearchParams {
  q: string;
  pos?: string;
  limit?: number;
}

export interface TenorTrendingParams {
  pos?: string;
  limit?: number;
}

export const readTenorConfig = (
  env: NodeJS.ProcessEnv = process.env,
): { apiKey: string } | { error: 'missing_api_key' } => {
  const apiKey = env.TENOR_API_KEY?.trim();
  if (!apiKey) return { error: 'missing_api_key' };
  return { apiKey };
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const buildUrl = (
  path: string,
  config: TenorClientConfig,
  params: Record<string, string | number | undefined>,
): string => {
  const url = new URL(`${TENOR_BASE}${path}`);
  url.searchParams.set('key', config.apiKey);
  url.searchParams.set('media_filter', MEDIA_FILTER);
  url.searchParams.set('contentfilter', config.contentFilter ?? 'medium');
  if (config.clientKey) url.searchParams.set('client_key', config.clientKey);
  if (config.locale) url.searchParams.set('locale', config.locale);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
};

const fetchJson = async <T>(url: string, fetchFn: typeof fetch): Promise<T> => {
  const res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TenorUpstreamError(res.status, body.slice(0, 256));
  }
  return (await res.json()) as T;
};

export class TenorUpstreamError extends Error {
  constructor(public readonly status: number, public readonly bodyExcerpt: string) {
    super(`Tenor upstream returned ${status}`);
    this.name = 'TenorUpstreamError';
  }
}

export const tenorSearch = async (
  config: TenorClientConfig,
  params: TenorSearchParams,
): Promise<TenorListResponse> => {
  const limit = clamp(params.limit ?? config.defaultLimit ?? 20, 1, 50);
  const url = buildUrl('/search', config, { q: params.q, pos: params.pos, limit });
  return fetchJson<TenorListResponse>(url, config.fetchFn ?? fetch);
};

export const tenorFeatured = async (
  config: TenorClientConfig,
  params: TenorTrendingParams,
): Promise<TenorListResponse> => {
  const limit = clamp(params.limit ?? config.defaultLimit ?? 20, 1, 50);
  const url = buildUrl('/featured', config, { pos: params.pos, limit });
  return fetchJson<TenorListResponse>(url, config.fetchFn ?? fetch);
};

/**
 * Tenor's TOS requires apps to register a "share" event when a user picks
 * a GIF. This improves their ranking model and is best-effort — failure
 * is swallowed so a flaky Tenor doesn't break the client send path.
 */
export const tenorRegisterShare = async (
  config: TenorClientConfig,
  id: string,
  q?: string,
): Promise<void> => {
  const url = buildUrl('/registershare', config, { id, q });
  try {
    await (config.fetchFn ?? fetch)(url, { method: 'GET' });
  } catch {
    // intentionally ignored
  }
};

/**
 * Shrinks the upstream Tenor payload to only the fields the client needs
 * to render the picker and send the message. Anything missing the
 * required GIF format is dropped.
 */
export interface TenorPickerItem {
  id: string;
  /** Human-readable description for a11y / alt text / message body. */
  description: string;
  /** Full-size GIF used when the user picks the result. */
  gif: { url: string; width: number; height: number; size?: number };
  /** Lightweight preview rendered in the picker grid. */
  preview: { url: string; width: number; height: number };
}

export const toPickerItems = (response: TenorListResponse): TenorPickerItem[] => {
  const items: TenorPickerItem[] = [];
  for (const r of response.results) {
    const gif = r.media_formats.gif;
    const preview = r.media_formats.tinygif ?? gif;
    if (!gif?.url || !preview?.url) continue;
    items.push({
      id: r.id,
      description: r.content_description || r.title || 'GIF',
      gif: { url: gif.url, width: gif.dims[0], height: gif.dims[1], size: gif.size },
      preview: { url: preview.url, width: preview.dims[0], height: preview.dims[1] },
    });
  }
  return items;
};
