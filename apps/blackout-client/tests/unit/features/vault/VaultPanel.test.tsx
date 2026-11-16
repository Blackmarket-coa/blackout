// @vitest-environment jsdom
//
// The vault said: "Your passphrase encrypts everything in the browser. The
// server only stores unreadable ciphertext — keep your passphrase safe, it
// cannot be recovered." Two things in that were not so. The label of each
// secret is sent to the server as it was typed. And the key depends on a
// value kept in this browser as well as on the passphrase, so the passphrase
// alone does not open the vault in another browser, or in this one once its
// site data is cleared. docs/security/trust-claims-2026-11-16.md, T14.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/app/features/vault/vaultClient', () => ({
    fetchVaultItems: vi.fn(async () => ({ items: [] })),
    createVaultItem: vi.fn(),
    deleteVaultItem: vi.fn(),
}));
vi.mock('../../../../src/app/features/vault/vaultCrypto', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    deriveVaultKey: vi.fn(async () => ({} as CryptoKey)),
}));

import { VaultPanel } from '../../../../src/app/features/vault/VaultPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReactDOM.Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
});

const render = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root?.render(
            <Provider store={createStore()}>
                <VaultPanel />
            </Provider>
        );
    });
    return container;
};

describe('the vault says what it encrypts', () => {
    it('does not say it encrypts everything, and says what it does not', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).not.toMatch(/encrypts everything|only stores unreadable/i);
        expect(text).toContain(
            'Each secret is encrypted in this browser with a key made from your passphrase, and the server stores it encrypted. The label you give a secret is not encrypted: the server can read it, so keep secrets out of labels.'
        );
    });

    it('says that the passphrase alone does not open it elsewhere', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).toContain(
            'The key also depends on a value kept in this browser: another browser, or this one after its site data is cleared, cannot open the vault, even with the passphrase. Neither can be recovered.'
        );
    });

    it('marks the label field as not encrypted', async () => {
        const container = await render();
        const passphrase = container.querySelector(
            '[data-testid="vault-passphrase"]'
        ) as HTMLInputElement;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(passphrase, 'correct horse battery');
            passphrase.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const unlock = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Unlock vault'
        );
        await act(async () => {
            unlock?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const label = container.querySelector(
            '[data-testid="vault-item-label"]'
        ) as HTMLInputElement;
        expect(label.placeholder).toBe('Label (not encrypted)');
    });
});
