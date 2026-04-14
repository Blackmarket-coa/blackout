// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StegoSettings } from '../../../../src/app/features/steganography';

describe('StegoSettings advanced entitlement surface', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('renders visible disabled advanced controls and shared upgrade CTA', async () => {
        const telemetry = vi.fn();
        window.addEventListener('blackout:telemetry', telemetry as EventListener);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <StegoSettings />
                </Provider>,
            );
            await Promise.resolve();
        });

        const advancedHeader = Array.from(container.querySelectorAll('strong')).find((node) =>
            node.textContent?.includes('Advanced stego controls'),
        );
        expect(advancedHeader).toBeTruthy();
        const advancedCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(
            (input) => (input.parentElement?.textContent ?? '').includes('(Advanced)'),
        );
        expect(advancedCheckboxes.length).toBeGreaterThan(0);
        advancedCheckboxes.forEach((input) => expect((input as HTMLInputElement).disabled).toBe(true));

        const upgradeButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Upgrade for Advanced'),
        );
        expect(upgradeButton).toBeTruthy();

        await act(async () => {
            upgradeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(telemetry).toHaveBeenCalled();

        root.unmount();
    });
});
