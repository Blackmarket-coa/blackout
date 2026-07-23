// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { ProfileEditor } from '../../../../src/app/features/profile/ProfileEditor';
import { myProfileAtom } from '../../../../src/app/features/profile/profileAtoms';
import { matrixClientAtom } from '../../../../src/app/state/auth';
import type { SaveProfileInput } from '../../../../src/app/features/profile/profileClient';

// The editor publishes the saved status to Matrix presence; stub it out so the
// test focuses purely on the payload the save sends.
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

const renderAndSave = async (seed: Record<string, unknown>): Promise<SaveProfileInput> => {
    const saveProfile = vi.fn().mockResolvedValue({});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    store.set(matrixClientAtom, mockClient as never);
    store.set(myProfileAtom, {
        ...store.get(myProfileAtom),
        ...seed,
    } as never);

    await act(async () => {
        root.render(
            <Provider store={store}>
                <ProfileEditor saveProfile={saveProfile} />
            </Provider>
        );
    });

    const saveButton = container.querySelector<HTMLButtonElement>(
        '[data-testid="profile-editor-save"]'
    );
    expect(saveButton).not.toBeNull();
    await act(async () => {
        saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    act(() => {
        root.unmount();
    });
    container.remove();

    expect(saveProfile).toHaveBeenCalledTimes(1);
    return saveProfile.mock.calls[0][1] as SaveProfileInput;
};

describe('ProfileEditor save payload sanitization', () => {
    it('omits a blank display name instead of sending "" (which the API rejects)', async () => {
        const payload = await renderAndSave({ displayName: '' });
        expect(payload.displayName).toBeUndefined();
    });

    it('never persists ephemeral blob: preview URLs for avatar or banner', async () => {
        const payload = await renderAndSave({
            displayName: 'Ty',
            avatarUrl: 'blob:https://app.example/9f61c1f0',
            profile: { banner: 'blob:https://app.example/1c5b8a22' },
        });
        expect(payload.avatarUrl).toBeUndefined();
        expect(payload.profile).toMatchObject({ banner: undefined });
    });

    it('passes non-empty values through trimmed', async () => {
        const payload = await renderAndSave({
            displayName: '  Ty  ',
            avatarUrl: 'https://cdn.example/avatar.png',
            primaryRole: '  ',
        });
        expect(payload.displayName).toBe('Ty');
        expect(payload.avatarUrl).toBe('https://cdn.example/avatar.png');
        expect(payload.primaryRole).toBeUndefined();
    });
});
