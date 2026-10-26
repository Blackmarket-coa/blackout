// @vitest-environment jsdom
/**
 * Account-number sign-up and the invite gate (D3 in
 * docs/security/api-findings-triage-2026-10-25.md). The invitation the invite
 * landing page stashed goes with the request: an invite-only server
 * (REQUIRE_INVITE_TOKEN=1) refuses a sign-up without one, and spends its use
 * when it creates the account. With nothing stashed the request carries no
 * token. A refusal comes back as an error that says why, and the stashed
 * invitation stays where it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_INVITE_STORAGE_KEY } from '../../../src/app/components/invite-landing';
import {
    AccountNumberSignupRefusedError,
    createAnonymousAccount,
} from '../../../src/client/accountNumberAuth';

/** A well-formed account number (26 characters of a-z and 2-7). */
const ACCOUNT_NUMBER = 'b7k2mqx4abcdefghijkmnpqrst';
const STASHED = 'stashed-invite';

let bodies: unknown[] = [];

/** Answer the sign-up request; anything else fails the test. */
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

const refusalOf = async (promise: Promise<unknown>): Promise<AccountNumberSignupRefusedError> => {
    const error = await promise.then(
        () => null,
        (e: unknown) => e
    );
    expect(error).toBeInstanceOf(AccountNumberSignupRefusedError);
    return error as AccountNumberSignupRefusedError;
};

beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    bodies = [];
});

describe('createAnonymousAccount', () => {
    it('sends the invitation the landing page stashed, and leaves it for the redeemer', async () => {
        window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, STASHED);
        answerSignUp(201, { accountNumber: ACCOUNT_NUMBER, invite: { ok: true } });

        await expect(createAnonymousAccount()).resolves.toBe(ACCOUNT_NUMBER);
        expect(bodies).toEqual([{ inviteToken: STASHED }]);
        expect(window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)).toBe(STASHED);
    });

    it('sends no token when none is stashed', async () => {
        answerSignUp(201, { accountNumber: ACCOUNT_NUMBER });

        await expect(createAnonymousAccount()).resolves.toBe(ACCOUNT_NUMBER);
        expect(bodies).toEqual([{}]);
    });

    it('reports an invite-only server refusing a sign-up with no invitation (403 invite_required)', async () => {
        answerSignUp(403, {
            code: 'invite_required',
            message: 'Registration requires an invitation token',
        });

        const refusal = await refusalOf(createAnonymousAccount());
        expect(refusal.refusal).toEqual({ code: 'invite_required' });
        expect(refusal.message).toBe(
            'New accounts here need an invitation. Open the invitation link you were sent, and create your account from there.'
        );
    });

    it.each([
        [
            'invalid',
            "Your invitation link wasn't recognized. Check it with the person who sent it.",
        ],
        [
            'exhausted',
            'Your invitation has already been used up. Ask the person who invited you for a new link.',
        ],
        ['expired', 'Your invitation has expired. Ask the person who invited you for a new link.'],
        ['revoked', 'Your invitation was revoked by the person who sent it.'],
        [
            'something-new',
            "Your invitation can't be used. Ask the person who invited you for a new link.",
        ],
        // An inherited object key is not a known reason either.
        [
            'constructor',
            "Your invitation can't be used. Ask the person who invited you for a new link.",
        ],
    ])(
        'reports an invitation that cannot be used (400 invite_token_invalid, %s) and keeps it stashed',
        async (reason, message) => {
            window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, STASHED);
            answerSignUp(400, {
                code: 'invite_token_invalid',
                message: 'Invitation token is not usable',
                reason,
            });

            const refusal = await refusalOf(createAnonymousAccount());
            expect(refusal.refusal).toEqual({ code: 'invite_token_invalid', reason });
            expect(refusal.message).toBe(message);
            expect(bodies).toEqual([{ inviteToken: STASHED }]);
            expect(window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)).toBe(STASHED);
        }
    );

    it('does not mistake another refusal for an account', async () => {
        answerSignUp(400, { code: 'invalid_request', message: 'Request body failed validation' });

        await expect(createAnonymousAccount()).rejects.toThrow('Could not create an account.');
    });
});
