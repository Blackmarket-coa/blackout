// @vitest-environment jsdom
//
// Render helpers for the key-backup guard's component tests (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`). The component under test
// gets a real `MatrixClient` through `MatrixClientProvider`; the client talks
// only to `createFakeKeyHomeserver`'s `fetchFn`, so the SDK's own HTTP layer
// produces what the guard sees. `stubCrypto` stands in for this device's
// crypto state (what `getCrypto()` answers), with spies on the three calls the
// from-scratch setup makes, so a test can show whether a click reached them.
import React, { type ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import type { MatrixClient } from 'matrix-js-sdk';
import type { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { vi } from 'vitest';
import { MatrixClientProvider } from '../../../src/app/hooks/useMatrixClient';
import { renderDialog, type MountedDialog } from './modalReliability';

export async function renderWithClient(mx: MatrixClient, node: ReactNode): Promise<MountedDialog> {
    return renderDialog(node, {
        wrap: (inner) => <MatrixClientProvider value={mx}>{inner}</MatrixClientProvider>,
    });
}

/** Lets pending promises and timers settle through React's act(). */
export async function settle(ms = 0): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    });
}

export async function waitFor(
    predicate: () => boolean,
    { timeoutMs = 8000, what = 'condition' }: { timeoutMs?: number; what?: string } = {}
): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}\n${bodyText()}`);
        }
        await settle(5);
    }
}

/** Folds' Overlay portals into document.body, so the whole body is read. */
export const bodyText = (): string => document.body.textContent ?? '';

export const buttonsNamed = (label: string): HTMLButtonElement[] =>
    Array.from(document.body.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === label
    );

export const buttonsLabelled = (ariaLabel: string): HTMLButtonElement[] =>
    Array.from(document.body.querySelectorAll(`button[aria-label="${ariaLabel}"]`));

export async function click(el: HTMLElement): Promise<void> {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

export async function submitForm(form: HTMLFormElement): Promise<void> {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
}

export interface CryptoStubOptions {
    /** What `isCrossSigningReady()` answers for THIS device. */
    crossSigningReady: boolean;
    /** What `getActiveSessionBackupVersion()` answers for THIS device. */
    activeBackupVersion?: string | null;
}

/**
 * Replaces `mx.getCrypto()` with a stub of this device's crypto state. The
 * three setup calls resolve at once and record their arguments; a test that
 * reaches them has reached the destructive path.
 */
export function stubCrypto(mx: MatrixClient, options: CryptoStubOptions) {
    const stub = {
        isCrossSigningReady: vi.fn(async () => options.crossSigningReady),
        getActiveSessionBackupVersion: vi.fn(async () => options.activeBackupVersion ?? null),
        createRecoveryKeyFromPassphrase: vi.fn(async () => ({
            encodedPrivateKey: 'EsTc 1111 2222 3333 4444 5555 6666 7777 8888 9999 AAAA BBBB',
            privateKey: new Uint8Array(32),
            keyInfo: {},
        })),
        bootstrapSecretStorage: vi.fn(async () => undefined),
        bootstrapCrossSigning: vi.fn(async () => undefined),
        resetKeyBackup: vi.fn(async () => undefined),
    };
    vi.spyOn(mx, 'getCrypto').mockReturnValue(stub as unknown as CryptoApi);
    return stub;
}

export type CryptoStub = ReturnType<typeof stubCrypto>;

export const destructiveCryptoCalls = (stub: CryptoStub): number =>
    stub.bootstrapSecretStorage.mock.calls.length +
    stub.bootstrapCrossSigning.mock.calls.length +
    stub.resetKeyBackup.mock.calls.length;
