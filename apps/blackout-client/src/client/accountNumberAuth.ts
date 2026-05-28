import { createFetchApiClient } from '@blackout/sdk';
import { solvePow } from './proofOfWork';
import { accountNumberToLocalpart, isValidAccountNumber, normalizeAccountNumber } from '@blackout/core';
import { loginWithPassword } from './auth';
import type { createStore } from 'jotai/vanilla';

type AtomStore = ReturnType<typeof createStore>;

const API_BASE_URL = (() => {
    if (typeof import.meta !== 'undefined') {
        return (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ?? '';
    }
    return '';
})();

const loginIntoAccount = async (store: AtomStore, baseUrl: string, accountNumber: string): Promise<void> => {
    const localpart = await accountNumberToLocalpart(accountNumber);
    const normalized = normalizeAccountNumber(accountNumber);
    await loginWithPassword(store, baseUrl, localpart, normalized);
};

export const createAnonymousAccount = async (): Promise<string> => {
    const client = createFetchApiClient({ baseUrl: API_BASE_URL });

    // Step 1: Request a proof-of-work challenge
    const challengeResult = (await client({
        method: 'POST',
        path: '/v1/auth/account-number/pow-challenge',
        body: {},
    })) as { challenge?: string; difficulty?: number };

    if (!challengeResult?.challenge || !challengeResult?.difficulty) {
        throw new Error('Failed to obtain proof-of-work challenge.');
    }

    // Step 2: Solve the challenge
    const solution = await solvePow(challengeResult.challenge, challengeResult.difficulty);

    // Step 3: Submit the account-number request with the pow token
    const result = (await client({
        method: 'POST',
        path: '/v1/auth/account-number',
        body: {},
        headers: { 'x-pow-token': solution.token },
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
