import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/outbound-webhooks. Mirrors
 * packages/api/src/routes/outboundEventWebhooks.ts.
 *
 * Symmetric counterpart to the inbound discord-compat webhook client:
 * the user supplies a target URL (their own Discord channel webhook,
 * Zapier, IFTTT, n8n, custom backend) and which event types they want
 * delivered there.
 */

export type OutboundEventType =
    | 'tip.created'
    | 'follow.created'
    | 'livestream.started'
    | 'livestream.ended'
    | 'chat.message.received';

export const ALL_OUTBOUND_EVENT_TYPES: OutboundEventType[] = [
    'tip.created',
    'follow.created',
    'livestream.started',
    'livestream.ended',
    'chat.message.received',
];

export interface OutboundEventWebhook {
    id: string;
    name: string;
    targetUrl: string;
    eventTypes: OutboundEventType[];
    isActive: boolean;
    consecutiveFailures: number;
    lastDeliveryAt?: string;
    lastStatus?: number;
    lastError?: string;
    deliveryCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ListSubscriptionsResponse {
    subscriptions: OutboundEventWebhook[];
}

export interface RegisterBody {
    name: string;
    targetUrl: string;
    eventTypes: OutboundEventType[];
}

export interface RegisterResponse {
    subscription: OutboundEventWebhook;
    /** Plaintext signing secret. Returned only at create time. */
    signingSecret: string;
}

export interface TestDeliverBody {
    signingSecret: string;
    eventType: OutboundEventType;
    data?: Record<string, unknown>;
}

export interface TestDeliverResponse {
    report: {
        subscriptionId: string;
        ok: boolean;
        status?: number;
        reason?: string;
    };
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/outbound-webhooks';

export const listSubscriptions = (
    options?: ApiCallOptions,
): Promise<ListSubscriptionsResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListSubscriptionsResponse>;

export const registerSubscription = (
    body: RegisterBody,
    options?: ApiCallOptions,
): Promise<RegisterResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<RegisterResponse>;

export const deleteSubscription = (
    id: string,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(id)}`,
    }) as Promise<{ ok: true }>;

export const testDeliver = (
    id: string,
    body: TestDeliverBody,
    options?: ApiCallOptions,
): Promise<TestDeliverResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(id)}/test`,
        body,
    }) as Promise<TestDeliverResponse>;

// ----------------------------- input validators -----------------------------

export const isValidName = (raw: string): boolean => {
    const t = raw.trim();
    return t.length > 0 && t.length <= 80;
};

export const isValidTargetUrl = (raw: string): boolean => {
    const t = raw.trim();
    if (!t || t.length > 2048) return false;
    let parsed: URL;
    try {
        parsed = new URL(t);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return !(
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
    );
};

export const isValidEventTypeSelection = (selection: string[]): boolean =>
    selection.every((t) => (ALL_OUTBOUND_EVENT_TYPES as string[]).includes(t));
