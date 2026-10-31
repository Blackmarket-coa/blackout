// @vitest-environment jsdom
/**
 * The account-number form on an invite-only server (D3 in
 * docs/security/api-findings-triage-2026-10-25.md): "Create an anonymous
 * account" sends the invitation the landing page stashed, and a refused
 * sign-up says why in the form, shows no account number, and leaves the
 * invitation stashed. Only the homeserver's login flows and the Matrix
 * sign-in are stubbed; the sign-up request goes through `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { formatAccountNumber } from '@blackout/core';

const loginFlowsMock = vi.fn();
vi.mock('matrix-js-sdk', () => ({
    createClient: vi.fn(() => ({ loginFlows: loginFlowsMock })),
}));

vi.mock('../../../src/client/auth', () => ({
    beginSsoRedirect: vi.fn(),
    loginWithPassword: vi.fn(),
    loginWithToken: vi.fn(),
}));

import { LoginForm } from '../../../src/app/components/bmc/auth/LoginForm';
import { PENDING_INVITE_STORAGE_KEY } from '../../../src/app/features/invitations/pendingInvite';

const server = {
    rawInput: 'example.org',
    serverName: 'example.org',
    baseUrl: 'https://example.org',
};
/** A well-formed account number (26 characters of a-z and 2-7). */
const ACCOUNT_NUMBER = 'b7k2mqx4abcdefghijkmnpqrst';
const STASHED = 'stashed-invite';

let bodies: unknown[] = [];
const roots: ReactDOM.Root[] = [];

const answerSignUp = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url !== '/v1/auth/account-number') throw new Error(`unexpected fetch ${url}`);
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        });
    });

const waitFor = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
    expect(condition()).toBe(true);
};

const renderForm = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <LoginForm server={server} canRegister onSwitchTab={vi.fn()} />
            </Provider>
        );
        await Promise.resolve();
    });
    await waitFor(() => createButton(container) !== undefined);
    return container;
};

const createButton = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create an anonymous account')
    );

const alertText = (container: HTMLElement) =>
    container.querySelector('[role="alert"]')?.textContent ?? null;

const createAnonymous = async (container: HTMLElement) => {
    await act(async () => {
        createButton(container)?.click();
        await Promise.resolve();
    });
    await waitFor(() => bodies.length === 1 && createButton(container)?.disabled !== true);
};

beforeEach(() => {
    document.body.innerHTML = '';
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    bodies = [];
    loginFlowsMock.mockResolvedValue({ flows: [{ type: 'm.login.password' }] });
});

afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
});

describe('account-number sign-up and the invite gate', () => {
    it('sends the stashed invitation and shows the new account number', async () => {
        window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, STASHED);
        answerSignUp(201, { accountNumber: ACCOUNT_NUMBER, invite: { ok: true } });
        const container = await renderForm();

        await act(async () => {
            createButton(container)?.click();
            await Promise.resolve();
        });
        await waitFor(
            () => container.textContent?.includes(formatAccountNumber(ACCOUNT_NUMBER)) === true
        );
        expect(bodies).toEqual([{ inviteToken: STASHED }]);
        expect(alertText(container)).toBeNull();
        expect(window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)).toBe(STASHED);
    });

    it('sends no invitation when none is stashed', async () => {
        answerSignUp(201, { accountNumber: ACCOUNT_NUMBER });
        const container = await renderForm();

        await act(async () => {
            createButton(container)?.click();
            await Promise.resolve();
        });
        await waitFor(
            () => container.textContent?.includes(formatAccountNumber(ACCOUNT_NUMBER)) === true
        );
        expect(bodies).toEqual([{}]);
    });

    it('says an invitation is needed when the server is invite-only (403 invite_required)', async () => {
        answerSignUp(403, {
            code: 'invite_required',
            message: 'Registration requires an invitation token',
        });
        const container = await renderForm();

        await createAnonymous(container);
        expect(alertText(container)).toBe(
            'New accounts here need an invitation. Open the invitation link you were sent, and create your account from there.'
        );
        expect(container.textContent).not.toContain('This is your account number');
        expect(createButton(container)).toBeDefined();
    });

    it.each([
        ['invalid', "Your invitation link wasn't recognized."],
        ['exhausted', 'Your invitation has already been used up.'],
        ['expired', 'Your invitation has expired.'],
        ['revoked', 'Your invitation was revoked by the person who sent it.'],
    ])(
        'says why the invitation cannot be used (400 invite_token_invalid, %s) and keeps it stashed',
        async (reason, said) => {
            window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, STASHED);
            answerSignUp(400, {
                code: 'invite_token_invalid',
                message: 'Invitation token is not usable',
                reason,
            });
            const container = await renderForm();

            await createAnonymous(container);
            expect(bodies).toEqual([{ inviteToken: STASHED }]);
            expect(alertText(container)).toContain(said);
            expect(container.textContent).not.toContain('This is your account number');
            expect(window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)).toBe(STASHED);
        }
    );
});
