import { buildServiceUrl } from './apiConfig';
import { getSession } from './session';

export type MarketplaceProviderId =
  | 'freeblackmarket'
  | 'blamazon'
  | 'mayhem-marketplaze'
  | 'antin-amazon';

export interface ProviderSummary {
  id: MarketplaceProviderId;
  displayName: string;
  enabled: boolean;
  capabilities: string[];
  fees: { feeBps: number; displayFeePercent: number; payoutCadence: 'weekly' | 'monthly' };
  presentation: { label: string; icon: string; profileSlug: string; profileHeadline: string };
  trust: {
    tier: 'verified' | 'community' | 'unverified';
    verificationBadge: string | null;
    trustSummary: string;
    checkoutDisclosure: string;
    payoutPolicy: string;
    refundPolicy: string;
    supportPolicy: string;
  };
  profileUrl: string;
}

export interface NormalizedListing {
  providerId: MarketplaceProviderId;
  providerListingId: string;
  category: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  sellerId: string | null;
  sellerDisplayName?: string;
  mediaUrls: string[];
  entitlementKind: string;
}

export interface NormalizedEntitlement {
  id: string;
  providerId: MarketplaceProviderId;
  providerListingId: string;
  sku: string | null;
  kind: string;
  status: 'granted' | 'pending' | 'refunded' | 'chargebacked' | 'revoked' | 'expired';
  grantedAt: string;
  expiresAt: string | null;
  sourceEventId: string;
  metadata: Record<string, unknown>;
}

const MARKETPLACE_PATH = '/v1/marketplace';

function authHeaders(): Record<string, string> {
  const session = getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  return headers;
}

export async function fetchProviders(): Promise<ProviderSummary[]> {
  const response = await fetch(buildServiceUrl(`${MARKETPLACE_PATH}/providers`), {
    headers: authHeaders(),
  });
  const data = (await response.json()) as { providers: ProviderSummary[] };
  return data.providers ?? [];
}

export async function fetchListings(filters: {
  providerId?: MarketplaceProviderId;
  category?: string;
  q?: string;
}): Promise<NormalizedListing[]> {
  const params = new URLSearchParams();
  if (filters.providerId) params.set('providerId', filters.providerId);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  const url = `${buildServiceUrl(`${MARKETPLACE_PATH}/listings`)}${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, { headers: authHeaders() });
  const data = (await response.json()) as { listings: NormalizedListing[] };
  return data.listings ?? [];
}

export async function fetchEntitlements(): Promise<NormalizedEntitlement[]> {
  const response = await fetch(buildServiceUrl(`${MARKETPLACE_PATH}/entitlements`), {
    headers: authHeaders(),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { entitlements: NormalizedEntitlement[] };
  return data.entitlements ?? [];
}

export async function startCheckout(
  providerId: MarketplaceProviderId,
  listingId: string
): Promise<{ redirectUrl: string; sessionId: string }> {
  const response = await fetch(buildServiceUrl(`${MARKETPLACE_PATH}/checkout`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      providerId,
      listingId,
      returnUrl: 'blackout://marketplace/return',
    }),
  });
  if (!response.ok) throw new Error(`checkout failed: ${response.status}`);
  return (await response.json()) as { redirectUrl: string; sessionId: string };
}
