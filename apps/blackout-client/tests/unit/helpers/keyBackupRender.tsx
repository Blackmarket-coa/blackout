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
import { renderDialog, type JotaiStore, type MountedDialog } from './modalReliability';

/**
 * `store`: pass the same jotai store to a second render to keep atom state
 * across a remount, as the app's one store does (each render otherwise gets
 * a fresh store).
 */
export async function renderWithClient(
    mx: MatrixClient,
    node: ReactNode,
    store?: JotaiStore
): Promise<MountedDialog> {
    return renderDialog(node, {
        wrap: (inner) => <MatrixClientProvider value={mx}>{inner}</MatrixClientProvider>,
        ...(store ? { store } : {}),
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

/**
 * Polls `predicate` through act() until it holds. The default gives up after
 * 4 s, inside Vitest's 5 s test timeout, so a case that fails stops polling
 * when it fails: a loop that outlived its test kept calling act() into the
 * next cases of the same file and failed them too (seen when the setup form's
 * check was removed to show the tests fail without it). A case that waits
 * longer passes its own `timeoutMs` and a test timeout above it.
 */
export async function waitFor(
    predicate: () => boolean,
    { timeoutMs = 4000, what = 'condition' }: { timeoutMs?: number; what?: string } = {}
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
        /** Read by the setup form after its cross-signing step: no key held here. */
        getCrossSigningKeyId: vi.fn(async (): Promise<string | null> => null),
    };
    vi.spyOn(mx, 'getCrypto').mockReturnValue(stub as unknown as CryptoApi);
    return stub;
}

export type CryptoStub = ReturnType<typeof stubCrypto>;

export const destructiveCryptoCalls = (stub: CryptoStub): number =>
    stub.bootstrapSecretStorage.mock.calls.length +
    stub.bootstrapCrossSigning.mock.calls.length +
    stub.resetKeyBackup.mock.calls.length;

/**
 * Runs `run`, then lets the event loop turn, and returns every Node-level
 * unhandled rejection raised meanwhile. A rejecting device check must not
 * escape a `void`-fired effect or click handler: Vitest reports such an
 * escape as a suite-level error, and a test here pins that there is none.
 */
export async function unhandledRejectionsDuring(run: () => Promise<void>): Promise<unknown[]> {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
        seen.push(reason);
    };
    // Typed locally: the client's tsconfig has no Node types, and jsdom runs on Node.
    type RejectionListener = (reason: unknown) => void;
    type NodeProcessLike = {
        on(event: 'unhandledRejection', listener: RejectionListener): unknown;
        off(event: 'unhandledRejection', listener: RejectionListener): unknown;
    };
    const nodeProcess = (globalThis as { process?: NodeProcessLike }).process;
    if (!nodeProcess) throw new Error('unhandledRejectionsDuring needs Node’s process');
    nodeProcess.on('unhandledRejection', onUnhandled);
    try {
        await run();
        await settle(50);
    } finally {
        nodeProcess.off('unhandledRejection', onUnhandled);
    }
    return seen;
}

/** How many times the guard asked `GET /room_keys/version` so far. */
export const backupVersionGets = (calls: { method: string; path: string }[]): number =>
    calls.filter((c) => c.method === 'GET' && c.path.endsWith('/room_keys/version')).length;
