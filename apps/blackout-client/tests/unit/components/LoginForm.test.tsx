// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';

const loginFlowsMock = vi.fn();
const beginSsoRedirectMock = vi.fn();
const loginWithPasswordMock = vi.fn();
const loginWithTokenMock = vi.fn();

vi.mock('matrix-js-sdk', () => ({
    createClient: vi.fn(() => ({
        loginFlows: loginFlowsMock,
    })),
}));

vi.mock('../../../src/client/auth', () => ({
    beginSsoRedirect: (...args: unknown[]) => beginSsoRedirectMock(...args),
    loginWithPassword: (...args: unknown[]) => loginWithPasswordMock(...args),
    loginWithToken: (...args: unknown[]) => loginWithTokenMock(...args),
}));

import { LoginForm } from '../../../src/app/components/bmc/auth/LoginForm';
import { MatrixInitError } from '../../../src/client/initMatrix';

const defaultServer = {
    rawInput: 'example.org',
    serverName: 'example.org',
    baseUrl: 'https://example.org',
};

describe('LoginForm', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        vi.clearAllMocks();
    });

    it('shows SSO fallback state when login flow discovery fails', async () => {
        loginFlowsMock.mockRejectedValueOnce(new Error('network down'));

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain(
            'Couldn’t load supported flows; try SSO or switch homeserver.'
        );
        expect(container.textContent).toContain('Continue with SSO');
        expect(container.textContent).not.toContain('Password');

        root.unmount();
    });

    it('handles token-only homeserver flows without forcing password UX', async () => {
        loginFlowsMock.mockResolvedValueOnce({
            flows: [{ type: 'm.login.token' }],
        });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={false} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain('This homeserver uses token sign-in.');
        expect(container.textContent).not.toContain(
            'This homeserver does not advertise a supported sign-in method.'
        );
        expect(container.textContent).not.toContain('Password');

        root.unmount();
    });

    it('completes SSO callback successfully with login token', async () => {
        loginFlowsMock.mockResolvedValueOnce({ flows: [{ type: 'm.login.sso' }] });
        loginWithTokenMock.mockResolvedValueOnce({});

        window.sessionStorage.setItem(
            'blackout.sso.pending',
            JSON.stringify({ baseUrl: 'https://sso.example.org' })
        );
        window.history.replaceState(null, '', '/?loginToken=abc123');

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(loginWithTokenMock).toHaveBeenCalledWith(expect.anything(), {
            baseUrl: 'https://sso.example.org',
            token: 'abc123',
        });
        expect(window.location.search).toBe('');
        expect(window.sessionStorage.getItem('blackout.sso.pending')).toBeNull();
        expect(container.textContent).not.toContain('SSO login failed.');

        root.unmount();
    });

    it('surfaces SSO callback failures', async () => {
        loginFlowsMock.mockResolvedValueOnce({ flows: [{ type: 'm.login.sso' }] });
        loginWithTokenMock.mockRejectedValueOnce(
            new MatrixInitError('network_failure', 'Unable to complete SSO.')
        );

        window.history.replaceState(null, '', '/?loginToken=abc123');

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.textContent).toContain('Unable to complete SSO.');
        expect(window.location.search).toBe('');

        root.unmount();
    });

    it('handles IdP denial/cancel and clears callback query parameters', async () => {
        loginFlowsMock.mockResolvedValueOnce({ flows: [{ type: 'm.login.sso' }] });

        window.sessionStorage.setItem(
            'blackout.sso.pending',
            JSON.stringify({ baseUrl: 'https://sso.example.org' })
        );
        window.history.replaceState(
            null,
            '',
            '/?error=access_denied&error_description=User%20cancelled%20sign-in'
        );

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(loginWithTokenMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain('User cancelled sign-in');
        expect(window.location.search).toBe('');
        expect(window.sessionStorage.getItem('blackout.sso.pending')).toBeNull();

        root.unmount();
    });

    it('uses a sanitized callback redirect URL when starting SSO', async () => {
        loginFlowsMock.mockResolvedValueOnce({
            flows: [
                {
                    type: 'm.login.sso',
                    identity_providers: [{ id: 'authentik', name: 'Authentik' }],
                },
            ],
        });
        loginWithTokenMock.mockResolvedValueOnce({});
        beginSsoRedirectMock.mockReturnValue(
            'https://example.org/_matrix/client/v3/login/sso/redirect'
        );

        window.history.replaceState(
            null,
            '',
            '/?loginToken=stale&code=123&state=456&error=access_denied&error_description=oops'
        );

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
        });

        const ssoButton = container.querySelector('button[type="button"]');
        expect(ssoButton).not.toBeNull();

        await act(async () => {
            ssoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(beginSsoRedirectMock).toHaveBeenCalledTimes(1);
        const redirectUrl = beginSsoRedirectMock.mock.calls[0]?.[1] as string;
        const parsed = new URL(redirectUrl);
        expect(beginSsoRedirectMock).toHaveBeenCalledWith(
            'https://example.org',
            redirectUrl,
            'sso',
            'authentik'
        );
        expect(parsed.search).toBe('');

        root.unmount();
    });
    // Black Mask chat panel (/embed): SSO would redirect the panel's whole
    // frame to the identity provider, so the panel does not offer it.
    it('hides SSO and explains why when allowSso is false (chat panel)', async () => {
        loginFlowsMock.mockResolvedValueOnce({
            flows: [
                { type: 'm.login.password' },
                {
                    type: 'm.login.sso',
                    identity_providers: [{ id: 'authentik', name: 'Authentik' }],
                },
            ],
        });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm
                        server={defaultServer}
                        canRegister={true}
                        onSwitchTab={vi.fn()}
                        allowSso={false}
                    />
                </Provider>
            );
            await Promise.resolve();
        });

        expect(container.textContent).not.toContain('Continue with Authentik');
        expect(container.textContent).not.toContain('Continue with SSO');
        const note = container.querySelector('[data-testid="login-sso-unavailable-in-panel"]');
        expect(note).not.toBeNull();
        const link = note?.querySelector('a');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
        // Password sign-in is still offered.
        expect(container.querySelector('form[aria-label="Sign in with password"]')).not.toBeNull();
        expect(beginSsoRedirectMock).not.toHaveBeenCalled();

        root.unmount();
    });

    it('still offers SSO by default (full app)', async () => {
        loginFlowsMock.mockResolvedValueOnce({
            flows: [
                {
                    type: 'm.login.sso',
                    identity_providers: [{ id: 'authentik', name: 'Authentik' }],
                },
            ],
        });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <LoginForm server={defaultServer} canRegister={true} onSwitchTab={vi.fn()} />
                </Provider>
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain('Continue with Authentik');
        expect(
            container.querySelector('[data-testid="login-sso-unavailable-in-panel"]')
        ).toBeNull();

        root.unmount();
    });
});
