// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { ProfileEditor } from '../../../../src/app/features/profile/ProfileEditor';
import { myProfileAtom } from '../../../../src/app/features/profile/profileAtoms';
import { matrixClientAtom } from '../../../../src/app/state/auth';

// The editor publishes the saved status to Matrix presence; stub it out so the
// test focuses purely on which userId the save targets.
vi.mock('../../../../src/app/features/profile/customStatus', () => ({
    syncStatusToPresence: vi.fn().mockResolvedValue(undefined),
}));

const mockClient = {
    getUserId: () => '@real:blackout.example',
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => mockClient,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ProfileEditor identity reconciliation', () => {
    it('saves against the authenticated Matrix id, not the seeded placeholder', async () => {
        const saveProfile = vi.fn().mockResolvedValue({});
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();
        store.set(matrixClientAtom, mockClient as never);

        // The self-profile seed ships empty; identity is populated from Matrix.
        expect(store.get(myProfileAtom).userId).toBe('');

        await act(async () => {
            root.render(
                <Provider store={store}>
                    <ProfileEditor saveProfile={saveProfile} />
                </Provider>
            );
        });

        // The mount effect should reconcile the stored placeholder to the real id.
        expect(store.get(myProfileAtom).userId).toBe('@real:blackout.example');

        const saveButton = container.querySelector<HTMLButtonElement>(
            '[data-testid="profile-editor-save"]'
        );
        expect(saveButton).not.toBeNull();

        await act(async () => {
            saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(saveProfile).toHaveBeenCalledTimes(1);
        expect(saveProfile.mock.calls[0][0]).toBe('@real:blackout.example');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
