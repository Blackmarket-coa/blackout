// @vitest-environment jsdom
//
// The legacy Devices page's "Enable" button (`EnableVerification`), the third
// entry that opens the from-scratch `DeviceVerificationSetup`. Its `visible`
// prop comes from account data (`useCrossSigningActive`), which never says
// whether a backup exists; the button must render only once the homeserver
// answered that the account has neither (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`). The page is not mounted in
// the shipped app today.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import { EnableVerification } from '../../../../../src/app/features/settings/devices/Verification';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserverOptions,
} from '../../../helpers/fakeKeyHomeserver';
import {
    bodyText,
    buttonsNamed,
    click,
    renderWithClient,
    settle,
    stubCrypto,
    waitFor,
} from '../../../helpers/keyBackupRender';
import type { MountedDialog } from '../../../helpers/modalReliability';

let mounted: MountedDialog | undefined;

const renderEnable = async (server: FakeKeyHomeserverOptions, visible = true) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    stubCrypto(mx, { crossSigningReady: false });
    mounted = await renderWithClient(mx, <EnableVerification visible={visible} />);
    await waitFor(() => hs.calls.some((c) => c.path.endsWith('/keys/query')) || !visible, {
        what: 'the account check',
    });
    await settle(20);
    return hs;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
});

describe('EnableVerification', () => {
    it('offers Enable only when the homeserver answered no backup and no master key', async () => {
        await renderEnable({ backupVersion: null, masterKey: false });
        const enable = buttonsNamed('Enable');
        expect(enable).toHaveLength(1);
        await click(enable[0]);
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
    });

    it('offers nothing when the account has a backup (account data says no cross-signing)', async () => {
        await renderEnable({ backupVersion: '3', masterKey: false });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('offers nothing when the backup check failed', async () => {
        await renderEnable({ backupAnswer: { kind: 'reject' }, masterKey: false });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('offers nothing when the server has a master key, whatever account data said', async () => {
        await renderEnable({ backupVersion: null, masterKey: true });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('renders nothing and asks nothing when not visible', async () => {
        const hs = await renderEnable({ backupVersion: null, masterKey: false }, false);
        expect(buttonsNamed('Enable')).toHaveLength(0);
        expect(hs.calls).toEqual([]);
    });
});
