// @vitest-environment jsdom
//
// What the from-scratch setup does to an account that already has a key
// backup, shown at the HTTP level: `DeviceVerificationSetup` is rendered with
// a real `MatrixClient` and real Rust crypto (in memory) against
// `createFakeKeyHomeserver`, and the form is submitted. This is the component's
// own code path, not a re-typed sequence. It is the fact that makes the guard
// necessary (S9, `docs/security/key-backup-nudge-2026-11-02.md`): the SDK's
// `resetKeyBackup` deletes every backup version the account has before it
// creates a new one (`rust-crypto/backup.js`, `setupKeyBackup` →
// `deleteAllKeyBackupVersions`).
//
// The account here has a backup and no cross-signing: the chip's develop path
// (account data said no cross-signing → the setup flow), and the only shape
// the fake homeserver answers without user-interactive auth, as Synapse does
// for a first master key.
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
import { createFakeKeyClient, createFakeKeyHomeserver } from '../helpers/fakeKeyHomeserver';
import {
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

describe('DeviceVerificationSetup against an account that has a backup', () => {
    it('submitting the form deletes the existing server backup version and replaces it', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: '3', masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        const crypto = mx.getCrypto();
        expect(crypto).toBeDefined();
        // This device's view, as on every new device.
        expect(await crypto!.isCrossSigningReady()).toBe(false);
        expect(await crypto!.getActiveSessionBackupVersion()).toBeNull();

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        const form = document.body.querySelector('form');
        expect(form).not.toBeNull();
        await submitForm(form as HTMLFormElement);

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
        // The screen never warned: it shows the new recovery key next.
        await waitFor(() => bodyText().includes('Recovery Key'), {
            what: 'the recovery key screen',
        });

        // resetKeyBackup starts the SDK's own backup check without awaiting
        // it. With `force`, this returns the in-flight check's promise, so the
        // check finishes before afterEach stops the client and closes its Rust
        // machine; the upload loop it then starts sleeps first and exits on
        // `stopped` without touching the machine.
        await crypto!.checkKeyBackupAndEnable(true);
        await settle(20);
    }, 60_000);
});
