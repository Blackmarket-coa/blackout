// @vitest-environment jsdom
//
// What the from-scratch setup's three SDK calls do to an account that already
// has a key backup, shown at the HTTP level with a real `MatrixClient` and
// real Rust crypto (in memory) against `createFakeKeyHomeserver`; and that
// the component that makes those calls (`DeviceVerificationSetup`) now
// refuses before the first of them against the same account. The first is
// the fact that makes the guard necessary (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`): the SDK's `resetKeyBackup`
// deletes every backup version the account has before it creates a new one
// (`rust-crypto/backup.js`, `setupKeyBackup` → `deleteAllKeyBackupVersions`).
// The second is the setup form's own last check (round 2).
//
// The account here has a backup and no cross-signing: the chip's develop path
// (account data said no cross-signing → the setup flow). The fake asks for
// user-interactive auth only when a master key already exists (the fork's
// Synapse under MSC3967; with its default config Synapse asks every time
// unless `ui_auth.session_timeout` is set), so this account's writes go
// through in one pass.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import type { MatrixClient } from 'matrix-js-sdk';
import { DeviceVerificationSetup } from '../../../src/app/components/DeviceVerificationSetup';
import { SETUP_REFUSED_TEXT } from '../../../src/client/keyBackupCheck';
import { clearSecretStorageKeys } from '../../../src/client/secretStorageKeys';
import { createFakeKeyClient, createFakeKeyHomeserver } from '../helpers/fakeKeyHomeserver';
import {
    backupVersionGets,
    bodyText,
    renderWithClient,
    settle,
    submitForm,
    waitFor,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

let mounted: MountedDialog | undefined;
let mx: MatrixClient | undefined;

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    mx?.stopClient();
    mx = undefined;
});

describe('the from-scratch setup against an account that has a backup', () => {
    it('the three SDK calls the setup makes delete the existing server backup version and replace it', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: '3', masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        const crypto = mx.getCrypto();
        expect(crypto).toBeDefined();
        // This device's view, as on every new device.
        expect(await crypto!.isCrossSigningReady()).toBe(false);
        expect(await crypto!.getActiveSessionBackupVersion()).toBeNull();

        // The same calls, in the same order, as `SetupVerification.setup`.
        const recoveryKeyData = await crypto!.createRecoveryKeyFromPassphrase(undefined);
        clearSecretStorageKeys();
        await crypto!.bootstrapSecretStorage({
            createSecretStorageKey: async () => recoveryKeyData,
            setupNewSecretStorage: true,
        });
        await crypto!.bootstrapCrossSigning({
            setupNewCrossSigning: true,
            authUploadDeviceSigningKeys: async (makeRequest) => {
                await makeRequest(null);
            },
        });
        await crypto!.resetKeyBackup();

        await waitFor(
            () =>
                hs.calls.some(
                    (c) => c.method === 'DELETE' && c.path.endsWith('/room_keys/version/3')
                ),
            { what: 'the DELETE of backup version 3', timeoutMs: 30_000 }
        );
        await waitFor(() => hs.backupVersion() !== null && hs.backupVersion() !== '3', {
            what: 'a replacement backup version',
            timeoutMs: 30_000,
        });

        // The existing backup is gone; a new one, under a new key, took its place.
        expect(hs.backupVersion()).toBe('4');
        // A new master key was uploaded: the account's cross-signing identity changed.
        expect(hs.masterKey()).not.toBeNull();
        // New secret storage was written to account data.
        expect(hs.accountData.has('m.secret_storage.default_key')).toBe(true);
        const writes = hs.destructiveCalls().map((c) => `${c.method} ${c.path}`);
        expect(writes).toContain('DELETE /_matrix/client/v3/room_keys/version/3');
        expect(writes).toContain('POST /_matrix/client/v3/room_keys/version');
        expect(writes).toContain('POST /_matrix/client/v3/keys/device_signing/upload');

        // resetKeyBackup starts the SDK's own backup check without awaiting
        // it. The public `CryptoApi.checkKeyBackupAndEnable()` takes no
        // argument and always forces that check (`rust-crypto.js`,
        // `checkKeyBackupAndEnable` → `backupManager.checkKeyBackupAndEnable(true)`),
        // so awaiting it returns the in-flight check's promise, and the check
        // finishes before afterEach stops the client and closes its Rust
        // machine; the upload loop it then starts sleeps first and exits on
        // `stopped` without touching the machine.
        await crypto!.checkKeyBackupAndEnable();
        await settle(20);
    }, 60_000);

    it('the component refuses before its first write: the backup stays, nothing is replaced, no recovery key is shown', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: '3', masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        const before = backupVersionGets(hs.calls);
        const form = document.body.querySelector('form');
        expect(form).not.toBeNull();
        await submitForm(form as HTMLFormElement);

        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.backup), {
            what: 'the refusal',
            timeoutMs: 30_000,
        });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(hs.backupVersion()).toBe('3');
        expect(hs.masterKey()).toBeNull();
        expect(hs.accountData.has('m.secret_storage.default_key')).toBe(false);
        expect(bodyText()).not.toContain('Store the Recovery Key');
        await settle(20);
    }, 60_000);
});
