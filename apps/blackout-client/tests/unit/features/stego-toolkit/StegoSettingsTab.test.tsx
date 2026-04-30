// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { StegoSettingsTab } from '../../../../src/app/features/stego-toolkit';

const mountTab = async (store = createStore()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <Provider store={store}>
                <StegoSettingsTab />
            </Provider>
        );
        await Promise.resolve();
    });

    return { container, root, store };
};

describe('StegoSettingsTab (BKL-008)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('renders the dedicated tab heading + opt-in section + folded StegoSettings panel', async () => {
        const { container } = await mountTab();

        expect(container.querySelector('[data-testid="stego-settings-tab"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stego-settings-tab-opt-in"]')).toBeTruthy();

        const headings = Array.from(container.querySelectorAll('h2')).map(
            (node) => node.textContent
        );
        expect(headings).toContain('Steganography');

        // The folded StegoSettings panel contributes the "Saved passphrases"
        // sub-card; if present, the BKL-005 surface is integrated.
        const savedPassphrasesHeader = Array.from(container.querySelectorAll('strong')).find(
            (node) => node.textContent?.includes('Saved passphrases')
        );
        expect(savedPassphrasesHeader).toBeTruthy();
    });

    it('toggles the opt-in checkbox and persists the change to atomWithStorage', async () => {
        const { container } = await mountTab();

        const toggle = container.querySelector(
            '[data-testid="stego-settings-tab-opt-in-toggle"]'
        ) as HTMLInputElement;
        expect(toggle).toBeTruthy();
        // Default for `stegoSettingsAtom.enabled` is `true`.
        expect(toggle.checked).toBe(true);

        await act(async () => {
            toggle.click();
            await Promise.resolve();
        });
        expect(toggle.checked).toBe(false);

        const persisted = JSON.parse(
            localStorage.getItem('blackout.settings.steganography.v1') ?? '{}'
        );
        expect(persisted.enabled).toBe(false);

        // Toggling back persists the inverse — proves the round-trip is real,
        // not just a one-shot write.
        await act(async () => {
            toggle.click();
            await Promise.resolve();
        });
        expect(toggle.checked).toBe(true);
        expect(
            JSON.parse(localStorage.getItem('blackout.settings.steganography.v1') ?? '{}').enabled
        ).toBe(true);
    });

    it('hydrates the opt-in state from a pre-seeded localStorage payload', async () => {
        localStorage.setItem(
            'blackout.settings.steganography.v1',
            JSON.stringify({
                enabled: false,
                savedPassphrases: [],
                advancedEntitled: false,
                advancedOptions: {
                    multiCarrierRouting: false,
                    expiryRemoteBurn: false,
                    policyAudit: false,
                },
            })
        );

        const { container } = await mountTab();

        const toggle = container.querySelector(
            '[data-testid="stego-settings-tab-opt-in-toggle"]'
        ) as HTMLInputElement;
        expect(toggle.checked).toBe(false);
    });
});
