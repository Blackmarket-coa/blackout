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
                    <LoginForm
                        server={defaultServer}
                        canRegister={true}
                        onSwitchTab={vi.fn()}
                    />
                </Provider>,
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain(
            'Couldn’t load supported flows; try SSO or switch homeserver.',
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
                    <LoginForm
                        server={defaultServer}
                        canRegister={false}
                        onSwitchTab={vi.fn()}
                    />
                </Provider>,
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain('This homeserver uses token sign-in.');
        expect(container.textContent).not.toContain('This homeserver does not advertise a supported sign-in method.');
        expect(container.textContent).not.toContain('Password');

        root.unmount();
    });

    it('completes SSO callback successfully with login token', async () => {
        loginFlowsMock.mockResolvedValueOnce({ flows: [{ type: 'm.login.sso' }] });
        loginWithTokenMock.mockResolvedValueOnce({});

        window.sessionStorage.setItem(
            'blackout.sso.pending',
            JSON.stringify({ baseUrl: 'https://sso.example.org' }),
        );
        window.history.replaceState(null, '', '/?loginToken=abc123');

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
                    />
                </Provider>,
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
            new MatrixInitError('network_failure', 'Unable to complete SSO.'),
        );

        window.history.replaceState(null, '', '/?loginToken=abc123');

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
                    />
                </Provider>,
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.textContent).toContain('Unable to complete SSO.');
        expect(window.location.search).toBe('');

        root.unmount();
    });
});
