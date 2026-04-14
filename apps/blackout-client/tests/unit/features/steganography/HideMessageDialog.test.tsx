// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HideMessageDialog } from '../../../../src/app/features/steganography';

describe('HideMessageDialog advanced gating', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('shows advanced controls disabled and emits upgrade intent', async () => {
        const telemetry = vi.fn();
        window.addEventListener('blackout:telemetry', telemetry as EventListener);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <HideMessageDialog open onClose={() => undefined} onEncoded={() => undefined} />
                </Provider>,
            );
            await Promise.resolve();
        });

        const advancedSelect = container.querySelector('select');
        expect(advancedSelect).toBeTruthy();
        expect((advancedSelect as HTMLSelectElement).disabled).toBe(true);

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
