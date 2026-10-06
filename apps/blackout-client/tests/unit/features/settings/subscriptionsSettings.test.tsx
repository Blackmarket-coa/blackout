// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { BlackoutSdkError } from '@blackout/sdk';
import type { ExternalPurchasePolicy } from '../../../../src/platform/external-purchase';

// Settings -> Subscriptions (feature registry row `account_subscriptions_manage`,
// uiEntry `settings_toggle:feature-toggle-account-subscriptions-manage`). Pins:
// the button calls POST /v1/subscriptions/manage-session and opens the link
// through the external-purchase opener; a link off the pinned FBM origin (or
// off FBM's manage page path) is never opened; the button is hidden where the
// purchase policy blocks it; and the copy makes no privacy or timing promise.

const apiCall = vi.fn();
vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient: () => apiCall,
}));
vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

let policy: ExternalPurchasePolicy = { allowed: true, mode: 'embedded', reason: 'web-platform' };
vi.mock('../../../../src/app/hooks/useExternalPurchasePolicy', () => ({
    useExternalPurchasePolicy: () => policy,
}));

const openExternalCheckoutUrl = vi.fn();
vi.mock('../../../../src/platform/external-purchase', () => ({
    openExternalCheckoutUrl: (url: string) => openExternalCheckoutUrl(url),
    resolveCheckoutReturnUrl: (href: string) => href,
}));

// eslint-disable-next-line import/first
import {
    MANAGE_BILLING_TESTID,
    SubscriptionsSettings,
} from '../../../../src/app/features/settings/subscriptions/SubscriptionsSettings';
// eslint-disable-next-line import/first
import {
    DEFAULT_FBM_MANAGE_ORIGINS,
    isAllowedManageBillingUrl,
    resolveManageBillingOrigins,
} from '../../../../src/app/features/settings/subscriptions/manageBillingLink';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FBM = 'https://api.freeblackmarket.com';
const PAGE = '/v1/integrations/blackout/commerce/subscriptions/manage-sessions';
const GOOD_URL = `${FBM}${PAGE}/tok_abcdef/page`;

const planSummary = {
    userId: 'user-1',
    tier: 'sprout',
    planCode: 'canopy_sprout_monthly',
    status: 'active',
    comped: false,
    entitlementActive: true,
    currentPeriodEndsAt: '2026-11-06T00:00:00.000Z',
    // The server makes these up for free users; the screen must never show them.
    stripeCustomerId: 'cus_user-1',
    lagoCustomerExternalId: 'cus_user-1',
};

let manageResponse: () => Promise<unknown> = async () => ({
    url: GOOD_URL,
    expiresAt: '2026-10-06T12:15:00.000Z',
});

let container: HTMLDivElement;
let root: ReactDOM.Root;

const render = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<SubscriptionsSettings />);
    });
    await act(async () => {
        await Promise.resolve();
    });
};

const manageButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>(`[data-testid="${MANAGE_BILLING_TESTID}"]`);

const clickManage = async () => {
    const button = manageButton();
    if (!button) throw new Error('manage button not rendered');
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
        await Promise.resolve();
    });
};

const manageCalls = () =>
    apiCall.mock.calls.filter(
        ([request]) => (request as { path: string }).path === '/v1/subscriptions/manage-session'
    );

beforeEach(() => {
    policy = { allowed: true, mode: 'embedded', reason: 'web-platform' };
    manageResponse = async () => ({ url: GOOD_URL, expiresAt: '2026-10-06T12:15:00.000Z' });
    openExternalCheckoutUrl.mockReset();
    openExternalCheckoutUrl.mockResolvedValue('window-open');
    apiCall.mockReset();
    apiCall.mockImplementation(async (request: { method: string; path: string }) => {
        if (request.path === '/v1/subscriptions/me') return { subscription: planSummary };
        if (request.path === '/v1/creator-subs/subscriptions/me') return { subscriptions: [] };
        if (request.path === '/v1/subscriptions/manage-session') return manageResponse();
        throw new Error(`unexpected ${request.method} ${request.path}`);
    });
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
});

describe('SubscriptionsSettings', () => {
    it('renders the manage button and opens the minted link in a new tab', async () => {
        // The member has a room and an event open: none of that may reach FBM.
        window.history.pushState({}, '', '/communities/!space:x/!room:y?event=$evt&panel=thread#m');
        await render();
        expect(manageButton()).not.toBeNull();
        expect(manageButton()?.textContent).toBe('Manage billing on Free Black Market');

        await clickManage();

        const calls = manageCalls();
        expect(calls).toHaveLength(1);
        const request = calls[0][0] as {
            method: string;
            body: { returnUrl?: string };
            retry?: { attempts: number };
        };
        expect(request.method).toBe('POST');
        // Origin only: no path, query or fragment from the open room.
        expect(request.body).toEqual({ returnUrl: `${window.location.origin}/` });
        const sent = new URL(request.body.returnUrl ?? '');
        expect(sent.pathname).toBe('/');
        expect(sent.search).toBe('');
        expect(sent.hash).toBe('');
        expect(request.body.returnUrl).not.toContain('room');
        window.history.pushState({}, '', '/');
        // One attempt: a mint revokes earlier links, and a 503 is a switch.
        expect(request.retry).toEqual({ attempts: 1 });
        expect(openExternalCheckoutUrl).toHaveBeenCalledWith(GOOD_URL);
        expect(container.querySelector('iframe')).toBeNull();
    });

    it('refuses a link whose origin is not pinned', async () => {
        manageResponse = async () => ({
            url: `https://evil.example${PAGE}/tok/page`,
            expiresAt: '2026-10-06T12:15:00.000Z',
        });
        await render();
        await clickManage();
        expect(openExternalCheckoutUrl).not.toHaveBeenCalled();
        expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
            /did not point at Free Black Market/
        );
        expect(
            container.querySelector('[data-testid="account-subscriptions-manage-link"]')
        ).toBeNull();
    });

    it('refuses a pinned-origin link that is not the manage page', async () => {
        manageResponse = async () => ({
            url: `${FBM}/store/redirect?to=https://evil.example`,
            expiresAt: '2026-10-06T12:15:00.000Z',
        });
        await render();
        await clickManage();
        expect(openExternalCheckoutUrl).not.toHaveBeenCalled();
    });

    it('hides the button where the purchase policy blocks it, keeping the read-only info', async () => {
        policy = { allowed: false, mode: 'blocked', reason: 'ios-storefront-not-us' };
        await render();
        expect(manageButton()).toBeNull();
        expect(
            container.querySelector('[data-testid="account-subscriptions-manage-unavailable"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="account-subscriptions-plan"]')
        ).not.toBeNull();
        expect(manageCalls()).toHaveLength(0);
    });

    it('says "not available yet" when the server switch is off (503)', async () => {
        manageResponse = async () => {
            throw new BlackoutSdkError('HTTP_REQUEST_FAILED', 'Request failed (503)', 'fatal', 503);
        };
        await render();
        await clickManage();
        expect(container.querySelector('[role="alert"]')?.textContent).toBe(
            'Billing management is not available yet.'
        );
        expect(openExternalCheckoutUrl).not.toHaveBeenCalled();
    });

    it('explains an ambiguous FBM billing identity (409)', async () => {
        manageResponse = async () => {
            throw new BlackoutSdkError('HTTP_REQUEST_FAILED', 'Request failed (409)', 'fatal', 409);
        };
        await render();
        await clickManage();
        expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Contact support/);
    });

    it('offers the link itself when the opener cannot confirm it opened', async () => {
        openExternalCheckoutUrl.mockResolvedValue('failed');
        await render();
        await clickManage();
        const link = container.querySelector<HTMLAnchorElement>(
            '[data-testid="account-subscriptions-manage-link"]'
        );
        expect(link?.getAttribute('href')).toBe(GOOD_URL);
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link?.getAttribute('target')).toBe('_blank');
    });

    it('shows the plan without made-up billing ids and without overstated copy', async () => {
        await render();
        const text = container.textContent ?? '';
        expect(text).toContain('Sprout');
        expect(text).not.toContain('cus_');
        expect(text).not.toMatch(
            /\b(private|privately|anonymous|anonymously|instant|instantly|immediately)\b/i
        );
        expect(text).toMatch(/sees your Blackout user ID/);
    });
});

describe('manageBillingLink', () => {
    it('defaults to the FBM production API origin', () => {
        expect(resolveManageBillingOrigins(undefined)).toEqual([...DEFAULT_FBM_MANAGE_ORIGINS]);
        expect(resolveManageBillingOrigins('')).toEqual([...DEFAULT_FBM_MANAGE_ORIGINS]);
    });

    it('accepts only bare https (or localhost http) origins from the override', () => {
        expect(
            resolveManageBillingOrigins(
                'https://staging.fbm.test, http://evil.example, https://x.test/path, http://localhost:9000'
            )
        ).toEqual(['https://staging.fbm.test', 'http://localhost:9000']);
        // Nothing valid falls back to the default, never to "allow all".
        expect(resolveManageBillingOrigins('*')).toEqual([...DEFAULT_FBM_MANAGE_ORIGINS]);
    });

    it('pins origin, scheme, credentials and the manage page path', () => {
        const origins = [FBM];
        expect(isAllowedManageBillingUrl(GOOD_URL, origins)).toBe(true);
        expect(isAllowedManageBillingUrl(`https://evil.example${PAGE}/t/page`, origins)).toBe(
            false
        );
        expect(
            isAllowedManageBillingUrl(`http://api.freeblackmarket.com${PAGE}/t/page`, origins)
        ).toBe(false);
        expect(
            isAllowedManageBillingUrl(`https://u:p@api.freeblackmarket.com${PAGE}/t/page`, origins)
        ).toBe(false);
        expect(isAllowedManageBillingUrl(`${FBM}${PAGE}/t/page/extra`, origins)).toBe(false);
        expect(
            isAllowedManageBillingUrl(`${FBM}${PAGE}/t/page?next=https://evil.example`, origins)
        ).toBe(false);
        expect(isAllowedManageBillingUrl(`${FBM}${PAGE}/t/page#frag`, origins)).toBe(false);
        expect(isAllowedManageBillingUrl(`${FBM}/store/customers/me`, origins)).toBe(false);
        expect(isAllowedManageBillingUrl('javascript:alert(1)', origins)).toBe(false);
        expect(isAllowedManageBillingUrl('not a url', origins)).toBe(false);
    });
});
