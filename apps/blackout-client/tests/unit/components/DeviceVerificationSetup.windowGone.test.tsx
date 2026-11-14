// @vitest-environment jsdom
//
// The setup's window going away by a route other than its close (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`, eighth review).
//
// Round 7 disabled the setup and reset dialogs' ✕ from the attempt's first
// write until it settled. The window could still go: a browser's Back (or
// Android's, which the app turns into `history.back()` when no overlay claims
// it) unmounts the nudge with its route; the chip's overlay goes with the
// chip, which the shipped app shows only in message-search results, when the
// results shift under it or its message becomes readable. The attempt then
// stopped before its next write, and the recovery key of what it had already
// written was never shown. Now:
//
// - while the attempt writes, the dialogs claim Android's back press, and the
//   page asks the browser to confirm an unload;
// - a window that goes away anyway leaves the attempt running until it
//   settles (at its end, at a step that fails, or at an account confirmation
//   that has not gone through: left open, as the next point says, asked only
//   after the window went, or answered with its request still on its way),
//   and its key (finished, or partway with that stage's text) is shown by
//   `RecoveryKeyHandoffHost`, which the app mounts beside its router;
// - an account confirmation left open by a window that went away is
//   cancelled, so the attempt settles rather than wait forever;
// - a second attempt of the same account does not start writing while such an
//   attempt runs on.
//
// And the chip inside a reply preview (`Reply`, a button whose click, in the
// shipped app's message-search results, opens the replied message and closes
// the search panel): its "Why?" and every click in its overlay stop at the
// chip, so the overlay explains instead of the host closing under it.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import { MatrixEvent } from 'matrix-js-sdk';
import type { EventTimelineSet, MatrixClient, Room } from 'matrix-js-sdk';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api';
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { DeviceVerificationReset } from '../../../src/app/components/DeviceVerificationSetup';
import { RecoveryKeyHandoffHost } from '../../../src/app/components/RecoveryKeyHandoffHost';
import {
    clearHandedOffRecoveryKeys,
    handOffRecoveryKey,
} from '../../../src/app/components/recoveryKeyHandoff';
import { MessageBadEncryptedContent } from '../../../src/app/components/message/content/FallbackContent';
import { Reply } from '../../../src/app/components/message/Reply';
import { KeyBackupNudge } from '../../../src/app/features/settings/security/KeyBackupNudge';
import { dispatchBackIntent } from '../../../src/platform/back-intent';
import {
    SETUP_BUSY_TEXT,
    SETUP_KEY_ELSEWHERE_TEXT,
    SETUP_PARTWAY_TEXT,
    SETUP_WRITING_TEXT,
} from '../../../src/client/keyBackupCheck';
import {
    ME,
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserver,
} from '../helpers/fakeKeyHomeserver';
import {
    bodyText,
    buttonsNamed,
    click,
    renderWithClient,
    settle,
    stubCrypto,
    submitForm,
    waitFor,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';
const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';
/** The key `stubCrypto`'s `createRecoveryKeyFromPassphrase` makes. */
const STUB_KEY = 'EsTc 1111 2222 3333 4444 5555 6666 7777 8888 9999 AAAA BBBB';

let mounted: MountedDialog | undefined;
let mx: MatrixClient | undefined;
/** Every held step's release, so a case that fails mid-attempt leaves no attempt writing. */
const releases: Array<() => void> = [];

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    clearHandedOffRecoveryKeys();
});

afterEach(async () => {
    mounted?.unmount();
    mounted = undefined;
    releases.splice(0).forEach((release) => release());
    await settle(50);
    clearHandedOffRecoveryKeys();
    if (mx) {
        // A finished setup starts the SDK's backup check without awaiting it;
        // let it finish before the Rust machine closes.
        await mx.getCrypto()?.checkKeyBackupAndEnable();
        await settle(20);
        mx.stopClient();
    }
    mx = undefined;
    vi.restoreAllMocks();
});

const submit = async () => {
    const form = document.body.querySelector('form');
    expect(form).not.toBeNull();
    await submitForm(form as HTMLFormElement);
};

/** A promise the test settles by hand. */
const held = () => {
    let release: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((resolve, reject) => {
        release = resolve;
        fail = reject;
    });
    releases.push(release);
    return { promise, release, fail };
};

/** Shows the recovery key on screen (its "Show" chip) and reads it. */
const shownRecoveryKey = async (): Promise<string> => {
    const [show] = buttonsNamed('Show');
    expect(show, 'a recovery key on screen').toBeDefined();
    await click(show);
    const keyText = document.body.querySelector('[style*="monospace"]')?.textContent ?? '';
    expect(keyText).not.toMatch(/\*/);
    return keyText;
};

/** The account's default secret-storage key id as the homeserver holds it. */
const defaultKeyId = (hs: FakeKeyHomeserver): string | undefined =>
    (hs.accountData.get('m.secret_storage.default_key') as { key?: string } | undefined)?.key;

/** Whether `recoveryKey` opens the account's default secret-storage key. */
const opensDefaultSecretStorage = async (
    hs: FakeKeyHomeserver,
    recoveryKey: string
): Promise<boolean> => {
    const keyId = defaultKeyId(hs);
    if (!keyId || !mx) return false;
    const info = hs.accountData.get(`m.secret_storage.key.${keyId}`) as
        | SecretStorageKeyDescription
        | undefined;
    if (!info) return false;
    return mx.secretStorage.checkKey(decodeRecoveryKey(recoveryKey), info);
};

/** A cancelable `beforeunload`, as the browser sends before a reload or a close. */
const unloadIsHeld = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

/** The nudge under a route, with the handoff host beside the router, as `main.tsx` mounts them. */
const renderNudgeInRouter = async (client: MatrixClient) => {
    const router = createMemoryRouter(
        [
            { path: '/explore', element: <p>Explore</p> },
            { path: '/', element: <KeyBackupNudge /> },
        ],
        { initialEntries: ['/explore', '/'], initialIndex: 1 }
    );
    mounted = await renderWithClient(
        client,
        <>
            <RouterProvider router={router} />
            <RecoveryKeyHandoffHost />
        </>
    );
    return router;
};

/** Row 1 of the nudge (nothing on the account) to its setup dialog. */
const openNudgeSetup = async () => {
    await waitFor(() => buttonsNamed('Set up backup').length > 0, {
        what: 'row 1',
        timeoutMs: 15_000,
    });
    await click(buttonsNamed('Set up backup')[0]);
    await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
};

/**
 * A stand-in for whatever renders the chip: the chip while `open`, gone when
 * not, with the handoff host beside it rather than inside. In the shipped app
 * that surface is the message-search panel.
 */
function ChipHost({ open }: { open: boolean }) {
    return (
        <>
            {open && <MessageBadEncryptedContent />}
            <RecoveryKeyHandoffHost />
        </>
    );
}

/** The chip's row 1 to its setup form: "Why?", the offer, "Set up backup". */
const openChipSetup = async () => {
    await click(buttonsNamed('Why?')[0]);
    await waitFor(() => buttonsNamed('Set up backup').length > 0, { what: 'the offer' });
    await click(buttonsNamed('Set up backup')[0]);
    await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
};

describe('while an attempt writes, Back and unload are held', () => {
    it('Android’s back press is claimed and the page asks before unloading, from the first write until the key shows', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const step = held();
        crypto.bootstrapCrossSigning.mockImplementationOnce(async () => {
            await step.promise;
        });
        await renderNudgeInRouter(client);
        await openNudgeSetup();

        // Before Continue nothing is written, and Back is the app's own.
        expect(dispatchBackIntent(window)).toBe(false);
        expect(unloadIsHeld()).toBe(false);

        await submit();
        await waitFor(() => crypto.bootstrapCrossSigning.mock.calls.length === 1, {
            what: 'the cross-signing step',
        });
        expect(bodyText()).toContain(SETUP_WRITING_TEXT);
        expect(dispatchBackIntent(window), 'the back press is claimed').toBe(true);
        expect(unloadIsHeld(), 'the page asks before unloading').toBe(true);
        expect(bodyText()).toContain(SETUP_HEADING);

        step.release();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
        });
        expect(dispatchBackIntent(window)).toBe(false);
        expect(unloadIsHeld()).toBe(false);
    }, 20_000);
});

describe('a window that goes away mid-write: the attempt finishes and its key is shown', () => {
    it('the nudge’s setup, then a browser Back (the verifier’s case)', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const step = held();
        crypto.bootstrapCrossSigning.mockImplementationOnce(async () => {
            await step.promise;
        });
        const router = await renderNudgeInRouter(client);
        await openNudgeSetup();
        await submit();
        await waitFor(() => crypto.bootstrapCrossSigning.mock.calls.length === 1, {
            what: 'the cross-signing step',
        });
        expect(bodyText()).toContain(SETUP_WRITING_TEXT);

        await act(async () => {
            await router.navigate(-1);
        });
        await settle(20);
        expect(bodyText()).toContain('Explore');
        expect(bodyText()).not.toContain(SETUP_HEADING);

        step.release();
        await waitFor(() => bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handed-off key',
        });
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(1);
        expect(bodyText()).toContain(RECOVERY_KEY_SCREEN);
        expect(await shownRecoveryKey()).toBe(STUB_KEY);
        expect(unloadIsHeld()).toBe(false);

        await click(buttonsNamed('Close')[0]);
        await waitFor(() => !bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handoff to close',
        });
    }, 20_000);

    it('the chip’s setup, then its host closes; a later step fails: the partway key is shown', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const step = held();
        crypto.bootstrapCrossSigning.mockImplementationOnce(async () => {
            await step.promise;
        });
        crypto.resetKeyBackup.mockImplementationOnce(async () => {
            throw new Error('Internal server error');
        });
        mounted = await renderWithClient(client, <ChipHost open />);
        await openChipSetup();
        await submit();
        await waitFor(() => crypto.bootstrapCrossSigning.mock.calls.length === 1, {
            what: 'the cross-signing step',
        });

        await mounted.rerender(<ChipHost open={false} />);
        await settle(20);
        expect(bodyText()).not.toContain(SETUP_HEADING);

        step.release();
        await waitFor(() => bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handed-off key',
        });
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(1);
        // The homeserver answers that it has no backup: stage backup_none.
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.backup_none.what);
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
        expect(bodyText()).not.toContain(SETUP_PARTWAY_TEXT.backup_none.next as string);
        expect(await shownRecoveryKey()).toBe(STUB_KEY);
    }, 20_000);

    it('real crypto: the nudge’s setup, Back during the cross-signing upload; the key shown opens the new secret storage', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('no crypto');
        const step = held();
        const bootstrapCrossSigning = crypto.bootstrapCrossSigning.bind(crypto);
        vi.spyOn(crypto, 'bootstrapCrossSigning').mockImplementationOnce(
            async (opts: Parameters<typeof bootstrapCrossSigning>[0]) => {
                await step.promise;
                return bootstrapCrossSigning(opts);
            }
        );
        const router = await renderNudgeInRouter(mx);
        await openNudgeSetup();
        await submit();
        await waitFor(() => defaultKeyId(hs) !== undefined, {
            what: 'the new secret storage',
            timeoutMs: 15_000,
        });

        await act(async () => {
            await router.navigate(-1);
        });
        await settle(20);
        expect(bodyText()).not.toContain(SETUP_HEADING);

        step.release();
        await waitFor(() => bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handed-off key',
            timeoutMs: 30_000,
        });
        expect(bodyText()).toContain(RECOVERY_KEY_SCREEN);
        expect(hs.masterKey()).not.toBeNull();
        expect(hs.backupVersion()).not.toBeNull();
        const shown = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, shown)).toBe(true);
    }, 40_000);

    it('real crypto: a reset whose window goes away with the password prompt open settles at cross-signing and shows its key', async () => {
        // A device that holds the account's cross-signing, no backup: the
        // reset replaces secret storage, then the upload asks for the password.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('no crypto');
        const oldKey = await crypto.createRecoveryKeyFromPassphrase();
        await crypto.bootstrapSecretStorage({
            createSecretStorageKey: async () => oldKey,
            setupNewSecretStorage: true,
        });
        await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true });
        await settle(100);
        const masterBefore = hs.masterKey();
        const defaultBefore = defaultKeyId(hs);

        mounted = await renderWithClient(
            mx,
            <>
                <DeviceVerificationReset onCancel={() => undefined} />
                <RecoveryKeyHandoffHost />
            </>
        );
        await click(buttonsNamed('Reset')[0]);
        await submit();
        await waitFor(() => bodyText().includes('Account Password'), {
            what: 'the password stage',
            timeoutMs: 30_000,
        });

        await mounted.rerender(<RecoveryKeyHandoffHost />);
        await waitFor(() => bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handed-off key',
            timeoutMs: 15_000,
        });
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.cross_signing.what);
        expect(hs.masterKey()).toBe(masterBefore);
        expect(defaultKeyId(hs)).not.toBe(defaultBefore);
        const shown = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, shown)).toBe(true);
    }, 40_000);
});

describe('a second attempt waits for one whose window went away', () => {
    it('Continue in a new setup refuses while the first attempt still writes, and goes on once it settled', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const step = held();
        crypto.bootstrapCrossSigning.mockImplementationOnce(async () => {
            await step.promise;
        });
        mounted = await renderWithClient(client, <ChipHost open />);
        await openChipSetup();
        await submit();
        await waitFor(() => crypto.bootstrapCrossSigning.mock.calls.length === 1, {
            what: 'the first attempt’s cross-signing step',
        });
        await mounted.rerender(<ChipHost open={false} />);
        await settle(20);

        // The chip again (another message, say): its setup's Continue.
        await mounted.rerender(<ChipHost open />);
        await openChipSetup();
        await submit();
        await waitFor(() => bodyText().includes(SETUP_BUSY_TEXT), { what: 'the refusal' });
        expect(crypto.bootstrapSecretStorage).toHaveBeenCalledTimes(1);
        expect(crypto.bootstrapCrossSigning).toHaveBeenCalledTimes(1);

        step.release();
        await waitFor(() => bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the first attempt’s key',
        });
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(1);

        // The first attempt has settled: the second form's Continue goes on.
        await click(buttonsNamed('Close')[0]);
        await waitFor(() => !bodyText().includes(SETUP_KEY_ELSEWHERE_TEXT), {
            what: 'the handoff to close',
        });
        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the second attempt’s recovery key',
        });
        expect(crypto.bootstrapSecretStorage).toHaveBeenCalledTimes(2);
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(2);
        expect(bodyText()).not.toContain(SETUP_BUSY_TEXT);
    }, 20_000);
});

describe('RecoveryKeyHandoffHost', () => {
    it('shows only the signed-in account’s keys, one at a time, and drops them when it goes away', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        handOffRecoveryKey({ userId: '@someone-else:example.org', recoveryKey: 'OTHER KEY' });
        mounted = await renderWithClient(client, <RecoveryKeyHandoffHost />);
        expect(bodyText()).not.toContain(SETUP_KEY_ELSEWHERE_TEXT);

        await act(async () => {
            handOffRecoveryKey({ userId: ME, recoveryKey: 'FIRST KEY', lead: 'First lead.' });
            handOffRecoveryKey({ userId: ME, recoveryKey: 'SECOND KEY' });
        });
        expect(bodyText()).toContain('First lead.');
        expect(await shownRecoveryKey()).toBe('FIRST KEY');
        await click(buttonsNamed('Close')[0]);
        expect(bodyText()).toContain(RECOVERY_KEY_SCREEN);
        expect(await shownRecoveryKey()).toBe('SECOND KEY');
        await click(buttonsNamed('Close')[0]);
        expect(bodyText()).not.toContain(SETUP_KEY_ELSEWHERE_TEXT);

        await act(async () => {
            handOffRecoveryKey({ userId: ME, recoveryKey: 'THIRD KEY' });
        });
        mounted.unmount();
        mounted = await renderWithClient(client, <RecoveryKeyHandoffHost />);
        expect(bodyText()).not.toContain(SETUP_KEY_ELSEWHERE_TEXT);
    });
});

describe('the chip inside a reply preview', () => {
    const roomId = '!room:example.org';
    const badEvent = new MatrixEvent({
        type: 'm.room.message',
        event_id: '$undecryptable',
        room_id: roomId,
        sender: '@bob:example.org',
        content: { msgtype: 'm.bad.encrypted', body: '** Unable to decrypt **' },
    });
    const room = { roomId, getMember: () => null } as unknown as Room;
    const timelineSet = { findEventById: () => badEvent } as unknown as EventTimelineSet;

    /**
     * `Reply` with a spy for its click and the replied event from a stand-in
     * timeline set. In the shipped app `Reply` shows the chip in
     * message-search results (`SearchResultGroup`), where its click opens the
     * replied message and closes the search panel; search passes no timeline
     * set, so `Reply` fetches the replied event from the homeserver, which
     * changes how the event arrives, not what a click does.
     */
    const renderReply = async (client: MatrixClient, onOpen: () => void) => {
        mounted = await renderWithClient(
            client,
            <QueryClientProvider client={new QueryClient()}>
                <Reply
                    room={room}
                    timelineSet={timelineSet}
                    replyEventId="$undecryptable"
                    onClick={onOpen}
                />
            </QueryClientProvider>
        );
    };

    it('“Why?” explains instead of opening the replied message', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        stubCrypto(client, { crossSigningReady: false });
        const onOpen = vi.fn();
        await renderReply(client, onOpen);
        await click(buttonsNamed('Why?')[0]);
        await waitFor(() => buttonsNamed('Set up backup').length > 0, { what: 'the offer' });
        expect(onOpen).not.toHaveBeenCalled();
    }, 20_000);

    it('clicks inside the overlay stay there: “Set up backup”, the dialog’s ✕ and “Close” do not reach the reply', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const onOpen = vi.fn();
        await renderReply(client, onOpen);
        await click(buttonsNamed('Why?')[0]);
        await waitFor(() => buttonsNamed('Set up backup').length > 0, { what: 'the offer' });
        // Whatever the chip's own click did, count from here.
        onOpen.mockClear();
        await click(buttonsNamed('Set up backup')[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        expect(onOpen).not.toHaveBeenCalled();
        await click(document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement);
        await waitFor(() => !bodyText().includes(SETUP_HEADING), { what: 'the dialog to close' });
        expect(onOpen).not.toHaveBeenCalled();

        // Again, closed from the explanation's own Close button.
        await click(buttonsNamed('Why?')[0]);
        await waitFor(() => buttonsNamed('Close').length > 0, { what: 'the offer again' });
        onOpen.mockClear();
        await click(buttonsNamed('Close')[0]);
        await waitFor(() => buttonsNamed('Set up backup').length === 0, {
            what: 'the offer to close',
        });
        expect(onOpen).not.toHaveBeenCalled();
        expect(crypto.bootstrapSecretStorage).not.toHaveBeenCalled();
    }, 20_000);
});
