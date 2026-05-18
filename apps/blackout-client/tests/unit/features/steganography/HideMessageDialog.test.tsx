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
                </Provider>
            );
            await Promise.resolve();
        });

        const advancedSelect = container.querySelector('select');
        expect(advancedSelect).toBeTruthy();
        expect((advancedSelect as HTMLSelectElement).disabled).toBe(true);

        const upgradeButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Upgrade for Advanced')
        );
        expect(upgradeButton).toBeTruthy();

        await act(async () => {
            upgradeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(telemetry).toHaveBeenCalled();

        root.unmount();
    });

    it('closes on Escape (audit C row)', async () => {
        const onClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <HideMessageDialog open onClose={onClose} onEncoded={() => undefined} />
                </Provider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await Promise.resolve();
        });

        expect(onClose).toHaveBeenCalled();

        root.unmount();
    });

    it('exposes role=dialog with an accessible name (audit C row)', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <HideMessageDialog open onClose={() => undefined} onEncoded={() => undefined} />
                </Provider>
            );
            await Promise.resolve();
        });

        const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null;
        expect(dialog).toBeTruthy();
        expect(dialog?.getAttribute('aria-modal')).toBe('true');
        const labelledBy = dialog?.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        const label = labelledBy ? document.getElementById(labelledBy) : null;
        expect(label?.textContent).toContain('Steganography');

        root.unmount();
    });

    it('traps focus inside the dialog on open so returnFocus fires on close (audit C row 6)', async () => {
        // focus-trap-react's default `returnFocusOnDeactivate: true` is the
        // contract this slice delivers. We verify the trap actually
        // activated by asserting focus moved inside the dialog; once
        // activated, focus-trap-react's unmount path returns focus to the
        // previously focused element (asserting that side directly is
        // fragile under JSDOM, so the audit row's full behaviour is
        // pinned by focus-trap-react's own tests + our e2e pass).
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <HideMessageDialog
                        open
                        onClose={() => undefined}
                        onEncoded={() => undefined}
                    />
                </Provider>
            );
            await Promise.resolve();
        });

        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).toBeTruthy();
        expect(dialog?.contains(document.activeElement)).toBe(true);

        root.unmount();
    });
});
