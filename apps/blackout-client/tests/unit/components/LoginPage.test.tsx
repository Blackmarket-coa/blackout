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

const loginWithPasswordMock = vi.fn();
const registerUserMock = vi.fn();
vi.mock('../../../src/client/auth', () => ({
    beginSsoRedirect: vi.fn(),
    loginWithPassword: (...args: unknown[]) => loginWithPasswordMock(...args),
    loginWithToken: vi.fn(),
    registerUser: (...args: unknown[]) => registerUserMock(...args),
}));

// Which session lengths the homeserver and the Blackout API enforce. Stubbed
// so no test reaches the network; the real lookup is tested in
// tests/unit/client/sessionLength.test.ts.
const fetchEnforcedSessionLengthsMock = vi.fn();
vi.mock('../../../src/client/sessionLength', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/client/sessionLength')>();
    return {
        ...actual,
        fetchEnforcedSessionLengths: (...args: unknown[]) =>
            fetchEnforcedSessionLengthsMock(...args),
    };
});

import { LoginPage } from '../../../src/app/components/bmc/auth/LoginPage';

const ALL_LENGTHS = ['1h', '1d', '7d', '30d', 'until_sign_out'];

const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountLoginPage = async ({ embedded = false }: { embedded?: boolean } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <LoginPage embedded={embedded} />
            </Provider>
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
        fetchEnforcedSessionLengthsMock.mockResolvedValue(new Set(ALL_LENGTHS));
        loginWithPasswordMock.mockResolvedValue({});
        // Pretend the homeserver issued a UIA challenge for unauthenticated
        // register requests — the canonical "registration is available" state.
        registerRequestMock.mockRejectedValue(
            Object.assign(new Error('uia challenge'), {
                httpStatus: 401,
                data: { flows: [{ stages: ['m.login.dummy'] }] },
            })
        );
    });

    it('lands on the register tab when the URL is /register', async () => {
        window.history.replaceState(null, '', '/register');
        const { container, root } = await mountLoginPage();

        const registerTab = container.querySelector('button[role="tab"][aria-selected="true"]');
        expect(registerTab?.textContent).toContain('Create account');
        root.unmount();
    });

    it('hides the register tab and surfaces a notice when the homeserver rejects signups', async () => {
        window.history.replaceState(null, '', '/register');
        registerRequestMock.mockRejectedValue(
            Object.assign(new Error('forbidden'), { httpStatus: 403 })
        );

        const { container, root } = await mountLoginPage();
        await act(async () => {
            await flushAsync();
        });

        // Only two tabs render (login, reset) and none of them is the register tab.
        const tabs = Array.from(
            container.querySelectorAll('button[role="tab"]')
        ) as HTMLButtonElement[];
        expect(tabs).toHaveLength(2);
        expect(tabs.map((t) => t.textContent)).not.toContain('Create account');

        const notice = container.querySelector('[data-testid="registration-disabled-notice"]');
        expect(notice).not.toBeNull();
        expect(notice?.textContent).toMatch(/signups are disabled/i);
        root.unmount();
    });

    it('replaces the URL when the user switches tabs so links match the surface', async () => {
        window.history.replaceState(null, '', '/login');
        const { container, root } = await mountLoginPage();

        const registerButton = Array.from(container.querySelectorAll('button[role="tab"]')).find(
            (b) => b.textContent?.includes('Create account')
        ) as HTMLButtonElement;

        await act(async () => {
            registerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flushAsync();
        });

        expect(window.location.pathname).toBe('/register');
        root.unmount();
    });
    // Black Mask chat panel: the panel's frame must stay on /embed, and
    // main.tsx decides panel-vs-app from the path, so the tabs must not
    // rewrite it.
    it('leaves the URL alone on tab switches when embedded in the chat panel', async () => {
        window.history.replaceState(null, '', '/embed');
        const { container, root } = await mountLoginPage({ embedded: true });

        const registerButton = Array.from(container.querySelectorAll('button[role="tab"]')).find(
            (b) => b.textContent?.includes('Create account')
        ) as HTMLButtonElement;
        expect(registerButton).toBeTruthy();

        await act(async () => {
            registerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flushAsync();
        });

        expect(registerButton.getAttribute('aria-selected')).toBe('true');
        expect(window.location.pathname).toBe('/embed');
        root.unmount();
    });
});

const radios = (container: HTMLElement) =>
    Array.from(
        container.querySelectorAll('input[type="radio"][name="panel-session-length"]')
    ) as HTMLInputElement[];

const signInButton = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('form[aria-label="Sign in with password"] button')).find(
        (b) => b.getAttribute('type') === 'submit'
    ) as HTMLButtonElement | undefined;

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const clickTab = async (container: HTMLElement, label: string) => {
    const tab = Array.from(container.querySelectorAll('button[role="tab"]')).find((b) =>
        b.textContent?.includes(label)
    ) as HTMLButtonElement;
    await act(async () => {
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushAsync();
    });
};

// Launch-plan step B3: in the chat panel the person picks how long the
// sign-in lasts — nothing preselected, and no way to sign in until they do.
describe('chat panel session length', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.history.replaceState(null, '', '/embed');
        vi.clearAllMocks();
        autoDiscoveryMock.mockResolvedValue([
            null,
            { 'm.homeserver': { base_url: 'https://example.org' } },
        ]);
        specVersionsMock.mockResolvedValue({});
        loginFlowsMock.mockResolvedValue({ flows: [{ type: 'm.login.password' }] });
        registerRequestMock.mockRejectedValue(
            Object.assign(new Error('uia challenge'), {
                httpStatus: 401,
                data: { flows: [{ stages: ['m.login.dummy'] }] },
            })
        );
        fetchEnforcedSessionLengthsMock.mockResolvedValue(new Set(ALL_LENGTHS));
        loginWithPasswordMock.mockResolvedValue({});
    });

    it('offers the five lengths with nothing chosen, and sign-in stays off until one is', async () => {
        const { container, root } = await mountLoginPage({ embedded: true });

        const picker = container.querySelector('[data-testid="session-length-picker"]');
        expect(picker).not.toBeNull();
        const options = radios(container);
        expect(options.map((r) => r.value)).toEqual(ALL_LENGTHS);
        expect(options.map((r) => r.parentElement?.textContent?.trim())).toEqual([
            '1 hour',
            '1 day',
            '7 days',
            '30 days',
            'Until I sign out',
        ]);
        // Nothing preselected — not even "Until I sign out".
        expect(options.some((r) => r.checked)).toBe(false);
        expect(options.every((r) => !r.disabled)).toBe(true);

        const button = signInButton(container);
        expect(button).toBeTruthy();
        expect(button?.disabled).toBe(true);
        expect(container.querySelector('[data-testid="session-choice-hint"]')?.textContent).toBe(
            'Choose how long to stay signed in first.'
        );
        expect(picker?.textContent).toContain('signed out on this device');

        // Submitting anyway (e.g. Enter in a field) does nothing.
        const form = container.querySelector(
            'form[aria-label="Sign in with password"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await flushAsync();
        });
        expect(loginWithPasswordMock).not.toHaveBeenCalled();

        await act(async () => {
            options[0].click();
            await flushAsync();
        });
        expect(options[0].checked).toBe(true);
        expect(signInButton(container)?.disabled).toBe(false);
        expect(container.querySelector('[data-testid="session-choice-hint"]')).toBeNull();

        const username = container.querySelector('input[name="username"]') as HTMLInputElement;
        const password = container.querySelector('input[name="password"]') as HTMLInputElement;
        await act(async () => {
            setInputValue(username, 'alice');
            setInputValue(password, 'correct horse');
            await flushAsync();
        });
        await act(async () => {
            signInButton(container)?.click();
            await flushAsync();
        });
        expect(loginWithPasswordMock).toHaveBeenCalledTimes(1);
        expect(loginWithPasswordMock.mock.calls[0][2]).toEqual({
            length: '1h',
            enforcedByServer: true,
        });
        root.unmount();
    });

    it('offers only "Until I sign out" when the servers do not enforce lengths', async () => {
        fetchEnforcedSessionLengthsMock.mockResolvedValue(new Set());
        const { container, root } = await mountLoginPage({ embedded: true });

        const options = radios(container);
        expect(options.filter((r) => !r.disabled).map((r) => r.value)).toEqual(['until_sign_out']);
        expect(options.some((r) => r.checked)).toBe(false);
        const picker = container.querySelector('[data-testid="session-length-picker"]');
        expect(picker?.textContent).toContain('can’t end panel sessions on a timer');
        // No promise about the server ending the session when it cannot.
        expect(picker?.textContent).not.toContain('even if this panel is closed');
        expect(signInButton(container)?.disabled).toBe(true);

        await act(async () => {
            options[4].click();
            await flushAsync();
        });
        expect(signInButton(container)?.disabled).toBe(false);
        const username = container.querySelector('input[name="username"]') as HTMLInputElement;
        const password = container.querySelector('input[name="password"]') as HTMLInputElement;
        await act(async () => {
            setInputValue(username, 'alice');
            setInputValue(password, 'correct horse');
            await flushAsync();
        });
        await act(async () => {
            signInButton(container)?.click();
            await flushAsync();
        });
        expect(loginWithPasswordMock.mock.calls[0][2]).toEqual({
            length: 'until_sign_out',
            enforcedByServer: false,
        });
        root.unmount();
    });

    it('offers nothing while it is still asking the servers', async () => {
        fetchEnforcedSessionLengthsMock.mockReturnValue(new Promise(() => undefined));
        const { container, root } = await mountLoginPage({ embedded: true });
        const options = radios(container);
        expect(options).toHaveLength(5);
        expect(options.every((r) => r.disabled)).toBe(true);
        expect(signInButton(container)?.disabled).toBe(true);
        expect(container.textContent).toContain('Checking which lengths this server can enforce');
        root.unmount();
    });

    it('makes creating an account wait for a session length too', async () => {
        const { container, root } = await mountLoginPage({ embedded: true });
        await clickTab(container, 'Create account');
        await act(async () => {
            await flushAsync();
        });
        const create = container.querySelector(
            'form[aria-label="Create account"] button[type="submit"]'
        ) as HTMLButtonElement;
        expect(create).toBeTruthy();
        expect(create.disabled).toBe(true);
        expect(
            container.querySelector('[data-testid="signup-session-choice-hint"]')
        ).not.toBeNull();
        await act(async () => {
            radios(container)[1].click();
            await flushAsync();
        });
        expect(create.disabled).toBe(false);
        root.unmount();
    });

    it('does not show the choice on the reset-password tab', async () => {
        const { container, root } = await mountLoginPage({ embedded: true });
        await clickTab(container, 'Reset password');
        expect(container.querySelector('[data-testid="session-length-picker"]')).toBeNull();
        root.unmount();
    });

    it('leaves the full app’s sign-in exactly as it was', async () => {
        window.history.replaceState(null, '', '/login');
        const { container, root } = await mountLoginPage();
        expect(container.querySelector('[data-testid="session-length-picker"]')).toBeNull();
        expect(container.querySelector('[data-testid="session-choice-hint"]')).toBeNull();
        expect(fetchEnforcedSessionLengthsMock).not.toHaveBeenCalled();
        expect(signInButton(container)?.disabled).toBe(false);

        const username = container.querySelector('input[name="username"]') as HTMLInputElement;
        const password = container.querySelector('input[name="password"]') as HTMLInputElement;
        await act(async () => {
            setInputValue(username, 'alice');
            setInputValue(password, 'correct horse');
            await flushAsync();
        });
        await act(async () => {
            signInButton(container)?.click();
            await flushAsync();
        });
        expect(loginWithPasswordMock).toHaveBeenCalledTimes(1);
        expect(loginWithPasswordMock.mock.calls[0][2]).toBeUndefined();
        root.unmount();
    });
});
