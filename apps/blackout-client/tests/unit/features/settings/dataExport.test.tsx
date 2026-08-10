// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

// The settings "Download your data" button used to call
// `/v1/auth/account/export` — the older, ~10-table export — while the
// comprehensive `/v1/data-export` was reachable only by curl. The UI was
// therefore serving people the weaker of the two exports. These tests pin the
// endpoint and the registry testid so that cannot silently regress.
//
// The testid also backs the `self_service_data_export` row in
// docs/features/feature_registry.json, whose failure-budget anchor lives in
// legacy/blackout-web/tests/integration/. That anchor is an empty placeholder by
// repo convention; this file is the coverage it stands for.

const apiCall = vi.fn();
vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient: () => apiCall,
}));
vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));
vi.mock('../../../../src/app/features/settings/settingsTelemetry', () => ({
    trackSettingsInteraction: () => {},
}));

// eslint-disable-next-line import/first
import { DataRetentionSection } from '../../../../src/app/features/settings/DataRetentionSection';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const exportPayload = {
    manifest: {
        schema: 'blackout.data-export.v1',
        generatedAt: '2026-08-10T00:00:00.000Z',
        userId: 'user-1',
        matrixHistory: { included: false, reason: 'end-to-end encrypted', howToExport: 'client' },
        excluded: ['Password hash…'],
    },
    account: { messages: [{ id: 'm1' }], linkedAccounts: [] },
    socialGraph: {},
    ledger: {},
};

let container: HTMLDivElement;
let root: ReactDOM.Root;

const render = () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<DataRetentionSection />);
    });
};

const exportButton = (): HTMLButtonElement => {
    const button = container.querySelector<HTMLButtonElement>(
        '[data-testid="feature-toggle-data-export"]'
    );
    if (!button) throw new Error('export button not found');
    return button;
};

beforeEach(() => {
    apiCall.mockReset();
    apiCall.mockResolvedValue(exportPayload);
    // The download path builds a blob URL and clicks an anchor. jsdom has no
    // real navigation, so letting the click through emits "Not implemented:
    // navigation" from a timer — the same shape of stray-timer noise that took
    // CI down via RoomTimeline.scroll. Stub the click; everything up to it
    // (fetch, payload handling, status message) still runs.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
});

describe('settings data export', () => {
    it('exposes the feature registry testid', () => {
        render();
        expect(exportButton()).toBeTruthy();
    });

    it('calls /v1/data-export, not the older account export', async () => {
        render();
        await act(async () => {
            exportButton().click();
        });

        expect(apiCall).toHaveBeenCalledTimes(1);
        const [request] = apiCall.mock.calls[0];
        expect(request.path).toBe('/v1/data-export');
        expect(request.path).not.toContain('/auth/account/export');
        expect(request.method).toBe('GET');
    });

    it('summarises from the account slice of the new envelope', async () => {
        render();
        await act(async () => {
            exportButton().click();
        });

        // Reading `data.messages` instead of `data.account.messages` would throw
        // on the new shape, so this also pins that the summary was migrated.
        expect(container.textContent).toMatch(/1 messages/);
    });

    it('tells the user encrypted content is not in the file', async () => {
        // The omission is the encryption guarantee working, not data loss — the
        // UI should say so rather than leaving the user to wonder.
        render();
        await act(async () => {
            exportButton().click();
        });
        expect(container.textContent).toMatch(/Encrypted message content is not included/i);
    });

    it('surfaces a failure instead of silently doing nothing', async () => {
        apiCall.mockRejectedValueOnce(new Error('boom'));
        render();
        await act(async () => {
            exportButton().click();
        });
        expect(container.textContent).toMatch(/Export failed: boom/);
    });
});
