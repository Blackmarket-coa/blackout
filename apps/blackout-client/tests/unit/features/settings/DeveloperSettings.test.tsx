// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';

// Mock leaf components so this test stays focused on the Developer-section
// interaction surface (toggle gating + telemetry on save) without pulling
// in the customization/stego/creator-studio subtrees.
vi.mock('../../../../src/app/features/steganography', () => ({
    StegoSettings: () => <div>stego</div>,
}));
vi.mock('../../../../src/app/features/settings/creator-studio', () => ({
    CreatorStudio: () => <div>creator-studio</div>,
}));

import DeveloperSettings from '../../../../src/app/features/settings/DeveloperSettings';

// React tracks input.checked / .value via an internal setter; setting the
// property directly bypasses that tracker so React swallows the change.
// The canonical fix is to call the native setter and then dispatch.
const setCheckboxChecked = (input: HTMLInputElement, checked: boolean) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'checked',
    )?.set;
    nativeSetter?.call(input, checked);
    input.dispatchEvent(new Event('click', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
};

const captureTelemetry = (): Array<{ name: string; section?: string; control?: string; value?: unknown }> => {
    const events: Array<{ name: string; section?: string; control?: string; value?: unknown }> = [];
    const handler = (ev: Event) => {
        const ce = ev as CustomEvent;
        events.push(ce.detail);
    };
    window.addEventListener('blackout:telemetry', handler);
    (events as unknown as { teardown: () => void }).teardown = () => {
        window.removeEventListener('blackout:telemetry', handler);
    };
    return events;
};

let container: HTMLDivElement;
let root: ReactDOM.Root;
let events: ReturnType<typeof captureTelemetry>;

beforeEach(() => {
    events = captureTelemetry();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
        root.render(
            <Provider store={createStore()}>
                <DeveloperSettings />
            </Provider>,
        );
    });
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
    (events as unknown as { teardown: () => void }).teardown();
});

describe('DeveloperSettings interactions', () => {
    it('hides the export button until diagnostics are enabled', () => {
        const exportButton = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Export debug bundle'),
        );
        expect(exportButton).toBeUndefined();

        // Toggle diagnostics.
        const diagnosticsCheckbox = container.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
        );
        expect(diagnosticsCheckbox).toBeTruthy();
        act(() => {
            setCheckboxChecked(diagnosticsCheckbox!, true);
        });

        const exportButtonAfter = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Export debug bundle'),
        );
        expect(exportButtonAfter).toBeDefined();
    });

    it('emits a settings_interaction event when the diagnostics toggle changes', () => {
        const diagnosticsCheckbox = container.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
        );
        act(() => {
            setCheckboxChecked(diagnosticsCheckbox!, true);
        });
        const interactions = events.filter((e) => e.name === 'settings_interaction');
        expect(interactions).toContainEqual(
            expect.objectContaining({
                name: 'settings_interaction',
                section: 'developer',
                control: 'diagnostics-enabled',
                value: true,
            }),
        );
    });

    it('emits telemetry on Export customization bundle click', () => {
        const exportBundleButton = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Export customization bundle'),
        );
        expect(exportBundleButton).toBeDefined();
        act(() => {
            exportBundleButton!.click();
        });
        const interactions = events.filter(
            (e) =>
                e.name === 'settings_interaction' &&
                e.control === 'export-customization-bundle',
        );
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toEqual(
            expect.objectContaining({ section: 'developer', value: true }),
        );
    });
});
