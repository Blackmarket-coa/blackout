// @vitest-environment jsdom
//
// `checkAccountKeyState` against a fake homeserver, through a real
// `MatrixClient`'s `fetchFn`: the SDK's own HTTP layer turns each answer into
// what the helper sees (a `MatrixError` for a JSON error, an `HTTPError` for a
// non-JSON one, the abort for a timeout). Only a 404 `M_NOT_FOUND` from
// `GET /room_keys/version` may read as "no backup"; everything else is
// "unknown", because "couldn't check" must never be treated as "nothing to
// lose" (S9, `docs/security/key-backup-nudge-2026-11-02.md`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ACCOUNT_KEY_CHECK_TIMEOUT_MS,
    SETUP_REFUSED_TEXT,
    accountKeyVerdict,
    checkAccountKeyState,
    checkBackupState,
    checkCrossSigningState,
    setupRefusal,
    type AccountKeyState,
} from '../../../src/client/keyBackupCheck';
import {
    ME,
    OLD_MASTER_KEY,
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeAnswer,
    type FakeKeyHomeserverOptions,
} from '../helpers/fakeKeyHomeserver';

const clientFor = (options: FakeKeyHomeserverOptions) => {
    const server = createFakeKeyHomeserver(options);
    const mx = createFakeKeyClient(server);
    return { server, mx };
};

afterEach(() => {
    vi.useRealTimers();
});

describe('checkBackupState: GET /room_keys/version', () => {
    it('a 200 with a version is a backup', async () => {
        const { mx } = clientFor({ backupVersion: '3' });
        expect(await checkBackupState(mx)).toEqual({ backup: 'backup' });
    });

    it('only a 404 M_NOT_FOUND is "none"', async () => {
        const { mx } = clientFor({ backupVersion: null });
        expect(await checkBackupState(mx)).toEqual({ backup: 'none' });
    });

    it('a 404 with another errcode is unknown, with the status and errcode', async () => {
        const { mx } = clientFor({
            backupAnswer: {
                kind: 'json',
                status: 404,
                body: { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' },
            },
        });
        expect(await checkBackupState(mx)).toEqual({
            backup: 'unknown',
            detail: 'it answered 404 M_UNRECOGNIZED',
        });
    });

    it('a 500 JSON error is unknown', async () => {
        const { mx } = clientFor({
            backupAnswer: {
                kind: 'json',
                status: 500,
                body: { errcode: 'M_UNKNOWN', error: 'Internal server error' },
            },
        });
        expect(await checkBackupState(mx)).toEqual({
            backup: 'unknown',
            detail: 'it answered 500 M_UNKNOWN',
        });
    });

    it('a 500 that is not JSON is unknown', async () => {
        const { mx } = clientFor({
            backupAnswer: {
                kind: 'text',
                status: 502,
                body: '<html>Bad Gateway</html>',
                contentType: 'text/html',
            },
        });
        expect(await checkBackupState(mx)).toEqual({
            backup: 'unknown',
            detail: 'it answered 502',
        });
    });

    it('a request that never reaches a server is unknown', async () => {
        const { mx } = clientFor({ backupAnswer: { kind: 'reject' } });
        expect(await checkBackupState(mx)).toEqual({ backup: 'unknown', detail: 'no answer' });
    });

    it(`no answer within ${ACCOUNT_KEY_CHECK_TIMEOUT_MS} ms is unknown`, async () => {
        vi.useFakeTimers();
        const { mx } = clientFor({ backupAnswer: { kind: 'hang' } });
        const pending = checkBackupState(mx);
        await vi.advanceTimersByTimeAsync(ACCOUNT_KEY_CHECK_TIMEOUT_MS + 1);
        expect(await pending).toEqual({ backup: 'unknown', detail: 'no answer' });
    });

    it('a 200 without a version is unknown, not a backup and not "none"', async () => {
        const { mx } = clientFor({
            backupAnswer: { kind: 'json', status: 200, body: { algorithm: 'x', auth_data: {} } },
        });
        expect(await checkBackupState(mx)).toEqual({
            backup: 'unknown',
            detail: 'it answered 200 without a version',
        });
    });

    it('asks every time: no cache', async () => {
        const { server, mx } = clientFor({ backupVersion: '3' });
        await checkBackupState(mx);
        server.setBackupVersion(null);
        expect(await checkBackupState(mx)).toEqual({ backup: 'none' });
        expect(
            server.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/room_keys/version'))
        ).toHaveLength(2);
    });
});

describe('checkCrossSigningState: POST /keys/query', () => {
    it('a master key for the account is "yes", with its public key', async () => {
        const { server, mx } = clientFor({ masterKey: true });
        expect(await checkCrossSigningState(mx)).toEqual({
            crossSigning: 'yes',
            masterKey: OLD_MASTER_KEY,
        });
        const query = server.calls.find((c) => c.path.endsWith('/keys/query'));
        expect(query?.body).toEqual({ device_keys: { [ME]: [] } });
    });

    it('a 200 without one is "no"', async () => {
        const { mx } = clientFor({ masterKey: false });
        expect(await checkCrossSigningState(mx)).toEqual({ crossSigning: 'no' });
    });

    it('a master key without a readable public key is still "yes", with no key to compare', async () => {
        const { mx } = clientFor({
            keysQueryAnswer: {
                kind: 'json',
                status: 200,
                body: { master_keys: { [ME]: { user_id: ME, usage: ['master'], keys: {} } } },
            },
        });
        expect(await checkCrossSigningState(mx)).toEqual({ crossSigning: 'yes' });
    });

    it('a failure is unknown', async () => {
        const failing: FakeAnswer = {
            kind: 'json',
            status: 500,
            body: { errcode: 'M_UNKNOWN', error: 'boom' },
        };
        const { mx } = clientFor({ keysQueryAnswer: failing });
        expect(await checkCrossSigningState(mx)).toEqual({
            crossSigning: 'unknown',
            detail: 'it answered 500 M_UNKNOWN',
        });
        const { mx: mx2 } = clientFor({ keysQueryAnswer: { kind: 'reject' } });
        expect(await checkCrossSigningState(mx2)).toEqual({
            crossSigning: 'unknown',
            detail: 'no answer',
        });
    });
});

describe('checkAccountKeyState', () => {
    it('combines both checks and never throws', async () => {
        const { mx } = clientFor({ backupVersion: '3', masterKey: true });
        expect(await checkAccountKeyState(mx)).toEqual({
            backup: 'backup',
            crossSigning: 'yes',
            masterKey: OLD_MASTER_KEY,
        });

        const { mx: mx2 } = clientFor({
            backupAnswer: { kind: 'reject' },
            keysQueryAnswer: { kind: 'reject' },
        });
        expect(await checkAccountKeyState(mx2)).toEqual({
            backup: 'unknown',
            crossSigning: 'unknown',
            detail: 'backup: no answer; cross-signing: no answer',
        });
    });
});

describe('accountKeyVerdict precedence', () => {
    it('a backup wins over everything', () => {
        expect(accountKeyVerdict({ backup: 'backup', crossSigning: 'yes' }, true)).toBe('backup');
        expect(accountKeyVerdict({ backup: 'backup', crossSigning: 'no' }, false)).toBe('backup');
        expect(accountKeyVerdict({ backup: 'backup', crossSigning: 'unknown' }, false)).toBe(
            'backup'
        );
    });

    it('a failed backup check is unknown, never "none", whatever cross-signing says', () => {
        expect(accountKeyVerdict({ backup: 'unknown', crossSigning: 'no' }, false)).toBe('unknown');
        expect(accountKeyVerdict({ backup: 'unknown', crossSigning: 'yes' }, true)).toBe('unknown');
        expect(accountKeyVerdict({ backup: 'unknown', crossSigning: 'unknown' }, false)).toBe(
            'unknown'
        );
    });

    it('with no backup, cross-signing from the server or from this device', () => {
        expect(accountKeyVerdict({ backup: 'none', crossSigning: 'yes' }, false)).toBe(
            'cross_signing'
        );
        expect(accountKeyVerdict({ backup: 'none', crossSigning: 'no' }, true)).toBe(
            'cross_signing'
        );
        expect(accountKeyVerdict({ backup: 'none', crossSigning: 'unknown' }, true)).toBe(
            'cross_signing'
        );
    });

    it('"none" only when the server answered no backup and no master key', () => {
        expect(accountKeyVerdict({ backup: 'none', crossSigning: 'no' }, false)).toBe('none');
    });

    it('no backup but an unanswered cross-signing check is unknown', () => {
        expect(accountKeyVerdict({ backup: 'none', crossSigning: 'unknown' }, false)).toBe(
            'unknown'
        );
    });
});

describe('setupRefusal: the check the setup form runs before its first write', () => {
    // Round 2 of S9: every entry re-checks at its click; this closes the
    // window between that click and the submit. Only 'none' from both checks
    // lets the from-scratch setup go on; the warned reset replaces
    // cross-signing on purpose but still never deletes a backup.
    const none: AccountKeyState = { backup: 'none', crossSigning: 'no' };

    it('from-scratch setup goes on only when the homeserver answered neither', () => {
        expect(setupRefusal(none, 'setup')).toBeNull();
    });

    it('a backup refuses both flows, with the backup text', () => {
        const state: AccountKeyState = { backup: 'backup', crossSigning: 'no' };
        expect(setupRefusal(state, 'setup')).toBe(SETUP_REFUSED_TEXT.backup);
        expect(setupRefusal(state, 'reset')).toBe(SETUP_REFUSED_TEXT.backup);
    });

    it('a failed backup check refuses both flows, with the unknown text', () => {
        const state: AccountKeyState = {
            backup: 'unknown',
            crossSigning: 'no',
            detail: 'no answer',
        };
        expect(setupRefusal(state, 'setup')).toBe(SETUP_REFUSED_TEXT.unknown);
        expect(setupRefusal(state, 'reset')).toBe(SETUP_REFUSED_TEXT.unknown);
    });

    it('cross-signing on the server refuses the from-scratch setup and lets the reset go on', () => {
        const state: AccountKeyState = { backup: 'none', crossSigning: 'yes' };
        expect(setupRefusal(state, 'setup')).toBe(SETUP_REFUSED_TEXT.crossSigning);
        expect(setupRefusal(state, 'reset')).toBeNull();
    });

    it('a failed cross-signing check refuses the from-scratch setup and lets the reset go on', () => {
        const state: AccountKeyState = { backup: 'none', crossSigning: 'unknown' };
        expect(setupRefusal(state, 'setup')).toBe(SETUP_REFUSED_TEXT.unknown);
        expect(setupRefusal(state, 'reset')).toBeNull();
    });

    it('a backup wins over everything: refused even when cross-signing is unknown', () => {
        const state: AccountKeyState = { backup: 'backup', crossSigning: 'unknown' };
        expect(setupRefusal(state, 'setup')).toBe(SETUP_REFUSED_TEXT.backup);
        expect(setupRefusal(state, 'reset')).toBe(SETUP_REFUSED_TEXT.backup);
    });

    it('every refusal says Blackout stopped before changing anything, and promises no recovery Blackout cannot do', () => {
        for (const text of Object.values(SETUP_REFUSED_TEXT)) {
            expect(text).toMatch(/stopped before changing anything/);
            expect(text).not.toMatch(/recover(ed|able)? when you sign in|don.t lose access/i);
        }
    });

    it('the unknown text names both checks, because either can be the one that failed', () => {
        expect(SETUP_REFUSED_TEXT.unknown).toMatch(/key backup or cross-signing/);
    });
});

describe('setupRefusal: the form finishing its own earlier attempt (fifth review)', () => {
    // An earlier submit of the same form uploaded cross-signing and failed at
    // a later step. The account now has a master key, the form's own; only
    // that key, with no backup, lets the from-scratch setup go on.
    const OWN = 'ownMasterKeyFromTheFormsEarlierAttempt000000';
    const ownOnServer: AccountKeyState = { backup: 'none', crossSigning: 'yes', masterKey: OWN };

    it('the homeserver holds the form’s own master key and no backup: goes on', () => {
        expect(setupRefusal(ownOnServer, 'setup', OWN)).toBeNull();
    });

    it('another master key: refused with the cross-signing text', () => {
        expect(setupRefusal({ ...ownOnServer, masterKey: OLD_MASTER_KEY }, 'setup', OWN)).toBe(
            SETUP_REFUSED_TEXT.crossSigning
        );
    });

    it('no key in the answer, or none of its own: refused with the cross-signing text', () => {
        const noKey: AccountKeyState = { backup: 'none', crossSigning: 'yes' };
        expect(setupRefusal(noKey, 'setup', OWN)).toBe(SETUP_REFUSED_TEXT.crossSigning);
        expect(setupRefusal(ownOnServer, 'setup', null)).toBe(SETUP_REFUSED_TEXT.crossSigning);
        expect(setupRefusal(ownOnServer, 'setup', undefined)).toBe(SETUP_REFUSED_TEXT.crossSigning);
        expect(setupRefusal(ownOnServer, 'setup', '')).toBe(SETUP_REFUSED_TEXT.crossSigning);
    });

    it('its own key never lets it past a backup or a failed backup check', () => {
        expect(setupRefusal({ ...ownOnServer, backup: 'backup' }, 'setup', OWN)).toBe(
            SETUP_REFUSED_TEXT.backup
        );
        expect(setupRefusal({ ...ownOnServer, backup: 'unknown' }, 'setup', OWN)).toBe(
            SETUP_REFUSED_TEXT.unknown
        );
    });

    it('a failed cross-signing check is still refused, whatever the form uploaded', () => {
        expect(
            setupRefusal({ backup: 'none', crossSigning: 'unknown', masterKey: OWN }, 'setup', OWN)
        ).toBe(SETUP_REFUSED_TEXT.unknown);
    });
});
