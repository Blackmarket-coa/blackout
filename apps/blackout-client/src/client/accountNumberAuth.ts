import { createFetchApiClient } from '@blackout/sdk';
import { createStore } from 'jotai/vanilla';
import {
    accountNumberToLocalpart,
    isValidAccountNumber,
    normalizeAccountNumber,
} from '@blackout/core';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';
import { loginWithPassword } from './auth';

type AtomStore = ReturnType<typeof createStore>;

const loginIntoAccount = async (
    store: AtomStore,
    baseUrl: string,
    accountNumber: string
): Promise<void> => {
    const normalized = normalizeAccountNumber(accountNumber);
    const localpart = await accountNumberToLocalpart(normalized);
    await loginWithPassword(store, {
        baseUrl,
        identifier: { type: 'm.id.user', user: localpart },
        password: normalized,
    });
};

/**
 * Create a no-PII account: the server mints a high-entropy account number and
 * provisions the Matrix account. Returns the number WITHOUT logging in, so the
 * UI can show it once and require the user to save it before continuing (after
 * login the form unmounts and the only-credential is gone). Sign in with
 * `loginWithAccountNumber` once the user confirms they've saved it.
 */
export const createAnonymousAccount = async (): Promise<string> => {
    const client = createFetchApiClient({ baseUrl: API_BASE_URL });
    const result = (await client({
        method: 'POST',
        path: '/v1/auth/account-number',
        body: {},
    })) as { accountNumber?: string };

    if (!result?.accountNumber || !isValidAccountNumber(result.accountNumber)) {
        throw new Error('Account creation returned an invalid account number.');
    }
    return result.accountNumber;
};

/** Sign in with an existing account number (derives the localpart locally). */
export const loginWithAccountNumber = async (
    store: AtomStore,
    baseUrl: string,
    accountNumber: string
): Promise<void> => {
    if (!isValidAccountNumber(accountNumber)) {
        throw new Error('That account number is not valid.');
    }
    await loginIntoAccount(store, baseUrl, accountNumber);
};
