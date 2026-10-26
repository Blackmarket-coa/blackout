import { createFetchApiClient } from '@blackout/sdk';
import { createStore } from 'jotai/vanilla';
import {
    accountNumberToLocalpart,
    isValidAccountNumber,
    normalizeAccountNumber,
} from '@blackout/core';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';
import { readPendingInviteToken } from '../app/features/invitations/pendingInvite';
import { loginWithPassword } from './auth';
import type { PanelSessionChoice } from './sessionLength';

type AtomStore = ReturnType<typeof createStore>;

const loginIntoAccount = async (
    store: AtomStore,
    baseUrl: string,
    accountNumber: string,
    choice?: PanelSessionChoice
): Promise<void> => {
    const normalized = normalizeAccountNumber(accountNumber);
    const localpart = await accountNumberToLocalpart(normalized);
    await loginWithPassword(
        store,
        {
            baseUrl,
            identifier: { type: 'm.id.user', user: localpart },
            password: normalized,
        },
        choice
    );
};

/**
 * Why the server would not create an account. An invite-only server
 * (`REQUIRE_INVITE_TOKEN=1`) refuses a sign-up that brings no invitation
 * (`403 invite_required`); any server refuses one whose invitation cannot be
 * used (`400 invite_token_invalid`, with the reason).
 */
export type AccountNumberSignupRefusal =
    | { code: 'invite_required' }
    | { code: 'invite_token_invalid'; reason?: string };

// A Map, not an object literal: the reason comes off the wire, and a plain
// object would answer for `constructor` and its other inherited keys.
const INVITE_REASON_MESSAGES = new Map<string, string>([
    ['invalid', "Your invitation link wasn't recognized. Check it with the person who sent it."],
    [
        'exhausted',
        'Your invitation has already been used up. Ask the person who invited you for a new link.',
    ],
    ['expired', 'Your invitation has expired. Ask the person who invited you for a new link.'],
    ['revoked', 'Your invitation was revoked by the person who sent it.'],
]);

const refusalMessage = (refusal: AccountNumberSignupRefusal): string => {
    if (refusal.code === 'invite_required') {
        return 'New accounts here need an invitation. Open the invitation link you were sent, and create your account from there.';
    }
    return (
        (refusal.reason !== undefined ? INVITE_REASON_MESSAGES.get(refusal.reason) : undefined) ??
        "Your invitation can't be used. Ask the person who invited you for a new link."
    );
};

/** A refused account-number sign-up; its message says why, in words the form shows as they are. */
export class AccountNumberSignupRefusedError extends Error {
    readonly refusal: AccountNumberSignupRefusal;

    constructor(refusal: AccountNumberSignupRefusal) {
        super(refusalMessage(refusal));
        this.name = 'AccountNumberSignupRefusedError';
        this.refusal = refusal;
    }
}

/**
 * Create a no-PII account: the server mints a high-entropy account number and
 * provisions the Matrix account. Returns the number WITHOUT logging in, so the
 * UI can show it once and require the user to save it before continuing (after
 * login the form unmounts and the only-credential is gone). Sign in with
 * `loginWithAccountNumber` once the user confirms they've saved it.
 *
 * The invitation the invite landing page stashed goes with the request as
 * `inviteToken`: an invite-only server refuses a sign-up without one, and the
 * server spends one of its uses when it creates the account. The token stays
 * stashed. After sign-in the pending-invite redeemer sends it to
 * `POST /v1/invitations/redeem`, which claims the use the sign-up spent (the
 * redemption is recorded, the inviter followed, the room routed to) instead of
 * spending another. A refusal throws `AccountNumberSignupRefusedError`.
 */
export const createAnonymousAccount = async (): Promise<string> => {
    const inviteToken = readPendingInviteToken();
    const client = createFetchApiClient({
        baseUrl: API_BASE_URL,
        // The refusals carry their reason in the body; resolve it, don't throw.
        resolveOnStatuses: [400, 403],
    });
    const result = (await client({
        method: 'POST',
        path: '/v1/auth/account-number',
        body: inviteToken ? { inviteToken } : {},
    })) as { accountNumber?: string; code?: string; reason?: string };

    if (result?.code === 'invite_required') {
        throw new AccountNumberSignupRefusedError({ code: 'invite_required' });
    }
    if (result?.code === 'invite_token_invalid') {
        throw new AccountNumberSignupRefusedError({
            code: 'invite_token_invalid',
            reason: result.reason,
        });
    }
    if (typeof result?.code === 'string') {
        throw new Error('Could not create an account.');
    }
    if (!result?.accountNumber || !isValidAccountNumber(result.accountNumber)) {
        throw new Error('Account creation returned an invalid account number.');
    }
    return result.accountNumber;
};

/**
 * Sign in with an existing account number (derives the localpart locally).
 * `choice` is the chat panel's session length (launch-plan B3); omitted in the
 * full app.
 */
export const loginWithAccountNumber = async (
    store: AtomStore,
    baseUrl: string,
    accountNumber: string,
    choice?: PanelSessionChoice
): Promise<void> => {
    if (!isValidAccountNumber(accountNumber)) {
        throw new Error('That account number is not valid.');
    }
    await loginIntoAccount(store, baseUrl, accountNumber, choice);
};
