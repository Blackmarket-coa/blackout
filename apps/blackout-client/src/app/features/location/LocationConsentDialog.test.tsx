// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationConsentDialog } from './LocationConsentDialog';

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await Promise.resolve();
    });
    return container;
};

describe('LocationConsentDialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders nothing when closed', async () => {
        const container = await render(
            <LocationConsentDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
        );
        expect(container.querySelector('[data-testid="location-consent-dialog"]')).toBeNull();
    });

    it('discloses anonymity effects and retained data', async () => {
        const container = await render(
            <LocationConsentDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />
        );
        const text = container.textContent ?? '';
        expect(text).toContain('anonymity');
        expect(text.toLowerCase()).toContain('what is kept');
        expect(text).toContain('~1 km');
    });

    it('keeps confirm disabled until the disclosure is acknowledged (step 2 gate)', async () => {
        const onConfirm = vi.fn();
        const container = await render(
            <LocationConsentDialog open onConfirm={onConfirm} onCancel={vi.fn()} />
        );
        const confirm = container.querySelector(
            '[data-testid="location-consent-confirm"]'
        ) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);

        // Clicking while unacknowledged must not grant consent.
        await act(async () => {
            confirm.click();
            await Promise.resolve();
        });
        expect(onConfirm).not.toHaveBeenCalled();

        const ack = container.querySelector(
            '[data-testid="location-consent-ack"]'
        ) as HTMLInputElement;
        await act(async () => {
            ack.click();
            await Promise.resolve();
        });
        expect(confirm.disabled).toBe(false);

        await act(async () => {
            confirm.click();
            await Promise.resolve();
        });
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('cancels when the "Not now" button is pressed', async () => {
        const onCancel = vi.fn();
        const container = await render(
            <LocationConsentDialog open onConfirm={vi.fn()} onCancel={onCancel} />
        );
        const cancel = container.querySelector(
            '[data-testid="location-consent-cancel"]'
        ) as HTMLButtonElement;
        await act(async () => {
            cancel.click();
            await Promise.resolve();
        });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
