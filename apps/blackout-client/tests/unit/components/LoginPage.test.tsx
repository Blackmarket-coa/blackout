// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';

const registerRequestMock = vi.fn();
const loginFlowsMock = vi.fn();
const autoDiscoveryMock = vi.fn();
const specVersionsMock = vi.fn();

vi.mock('matrix-js-sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('matrix-js-sdk')>();
    return {
        ...actual,
        createClient: vi.fn(() => ({
            loginFlows: loginFlowsMock,
            registerRequest: registerRequestMock,
        })),
    };
});

vi.mock('../../../src/app/cs-api', () => ({
    autoDiscovery: (...args: unknown[]) => autoDiscoveryMock(...args),
    specVersions: (...args: unknown[]) => specVersionsMock(...args),
}));

vi.mock('../../../src/client/auth', () => ({
    beginSsoRedirect: vi.fn(),
    loginWithPassword: vi.fn(),
    loginWithToken: vi.fn(),
    registerUser: vi.fn(),
}));

import { LoginPage } from '../../../src/app/components/bmc/auth/LoginPage';

const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountLoginPage = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <LoginPage />
            </Provider>,
        );
        await flushAsync();
    });
    return { container, root };
};

describe('LoginPage URL-driven tab + registration availability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.history.replaceState(null, '', '/');
        vi.clearAllMocks();
        autoDiscoveryMock.mockResolvedValue([
            null,
            { 'm.homeserver': { base_url: 'https://example.org' } },
        ]);
        specVersionsMock.mockResolvedValue({});
        loginFlowsMock.mockResolvedValue({ flows: [{ type: 'm.login.password' }] });
        // Pretend the homeserver issued a UIA challenge for unauthenticated
        // register requests — the canonical "registration is available" state.
        registerRequestMock.mockRejectedValue(
            Object.assign(new Error('uia challenge'), {
                httpStatus: 401,
                data: { flows: [{ stages: ['m.login.dummy'] }] },
            }),
        );
    });

    it('lands on the register tab when the URL is /register', async () => {
        window.history.replaceState(null, '', '/register');
        const { container, root } = await mountLoginPage();

        const registerTab = container.querySelector(
            'button[role="tab"][aria-selected="true"]',
        );
        expect(registerTab?.textContent).toContain('Create account');
        root.unmount();
    });

    it('hides the register tab and surfaces a notice when the homeserver rejects signups', async () => {
        window.history.replaceState(null, '', '/register');
        registerRequestMock.mockRejectedValue(
            Object.assign(new Error('forbidden'), { httpStatus: 403 }),
        );

        const { container, root } = await mountLoginPage();
        await act(async () => {
            await flushAsync();
        });

        // Only two tabs render (login, reset) and none of them is the register tab.
        const tabs = Array.from(
            container.querySelectorAll('button[role="tab"]'),
        ) as HTMLButtonElement[];
        expect(tabs).toHaveLength(2);
        expect(tabs.map((t) => t.textContent)).not.toContain('Create account');

        const notice = container.querySelector(
            '[data-testid="registration-disabled-notice"]',
        );
        expect(notice).not.toBeNull();
        expect(notice?.textContent).toMatch(/signups are disabled/i);
        root.unmount();
    });

    it('replaces the URL when the user switches tabs so links match the surface', async () => {
        window.history.replaceState(null, '', '/login');
        const { container, root } = await mountLoginPage();

        const registerButton = Array.from(
            container.querySelectorAll('button[role="tab"]'),
        ).find((b) => b.textContent?.includes('Create account')) as HTMLButtonElement;

        await act(async () => {
            registerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flushAsync();
        });

        expect(window.location.pathname).toBe('/register');
        root.unmount();
    });
});
