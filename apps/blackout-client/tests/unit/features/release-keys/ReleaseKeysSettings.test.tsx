// @vitest-environment jsdom
/**
 * Settings → Release keys binds no token into its API client, so each request
 * reads the stored one. After "Sign out every Blackout session", a token
 * bound at render would be sent, refused and re-exchanged on every request.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAuthorizedApiClient = vi.fn((_token: string | null) => vi.fn());

vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient: (token: string | null) => createAuthorizedApiClient(token),
}));
vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'token-read-at-render',
}));
vi.mock('../../../../src/app/features/release-keys/ReleaseKeysPanel', () => ({
    ReleaseKeysPanel: () => <p>panel</p>,
}));

import ReleaseKeysSettings from '../../../../src/app/features/release-keys/ReleaseKeysSettings';

describe('ReleaseKeysSettings', () => {
    let container: HTMLDivElement;
    let root: ReactDOM.Root;

    beforeEach(() => {
        createAuthorizedApiClient.mockClear();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = ReactDOM.createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('builds its API client without the token read at render', () => {
        act(() => root.render(<ReleaseKeysSettings />));
        expect(container.textContent).toBe('panel');
        expect(createAuthorizedApiClient).toHaveBeenCalledTimes(1);
        expect(createAuthorizedApiClient).toHaveBeenCalledWith(null);
    });
});
