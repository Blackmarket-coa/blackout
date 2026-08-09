// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Account-data store the fake client reads and writes.
let accountData: Record<string, unknown> = {};
const setAccountData = vi.fn(async (type: string, content: Record<string, unknown>) => {
    accountData[type] = content;
});

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getAccountData: (type: string) =>
            type in accountData ? { getContent: () => accountData[type] } : undefined,
        setAccountData: (type: string, content: Record<string, unknown>) =>
            setAccountData(type, content),
    }),
    useMatrixClientOrNull: () => null,
}));

vi.mock('../../hooks/useAccountData', () => ({ useAccountData: () => undefined }));

vi.mock('../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: undefined, loading: false, error: undefined }),
    useLegacyRoomMembersAdapter: () => ({ data: [], loading: false, error: undefined }),
}));

import {
    CANOPY_ONBOARDING_COMPLETED_KEY,
    MEMBER_ONBOARDING_PROGRESS_KEY,
} from '../onboarding/accountDataKeys';
import { useOnboardingCompletion } from './useWelcome';

const SPACE = '!canopy:srv';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const renderHook = async <T,>(hook: () => T) => {
    const ref: { current: T | null } = { current: null };
    const Component = () => {
        ref.current = hook();
        return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(Component));
        await flush();
    });
    return ref as { current: T };
};

describe('useOnboardingCompletion', () => {
    beforeEach(() => {
        accountData = {};
        setAccountData.mockClear();
        document.body.innerHTML = '';
    });

    it('reports incomplete when neither first-run system has run', async () => {
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await expect(ref.current.readCompletion()).resolves.toBe(false);
    });

    it('reports complete from the canopy wizard key', async () => {
        accountData[CANOPY_ONBOARDING_COMPLETED_KEY] = { spaces: { [SPACE]: true } };
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await expect(ref.current.readCompletion()).resolves.toBe(true);
    });

    it('reports complete from the member flow key, so the wizard stops interrupting', async () => {
        accountData[MEMBER_ONBOARDING_PROGRESS_KEY] = {
            spaces: { [SPACE]: { completed: true, stepIndex: 7 } },
        };
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await expect(ref.current.readCompletion()).resolves.toBe(true);
    });

    it('does not treat an in-progress member flow as complete', async () => {
        accountData[MEMBER_ONBOARDING_PROGRESS_KEY] = {
            spaces: { [SPACE]: { completed: false, stepIndex: 3 } },
        };
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await expect(ref.current.readCompletion()).resolves.toBe(false);
    });

    it('scopes completion to the space it was recorded against', async () => {
        accountData[MEMBER_ONBOARDING_PROGRESS_KEY] = {
            spaces: { '!other:srv': { completed: true } },
        };
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await expect(ref.current.readCompletion()).resolves.toBe(false);
    });

    it('persists selections alongside the completion flag', async () => {
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await act(async () => {
            await ref.current.markCompleted({ roles: ['Scout'], channels: ['#intros'] });
        });

        expect(accountData[CANOPY_ONBOARDING_COMPLETED_KEY]).toEqual({
            spaces: { [SPACE]: true },
            selections: { [SPACE]: { roles: ['Scout'], channels: ['#intros'] } },
        });
    });

    it('omits the selections key when nothing was picked', async () => {
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await act(async () => {
            await ref.current.markCompleted({ roles: [], channels: [] });
        });

        expect(accountData[CANOPY_ONBOARDING_COMPLETED_KEY]).toEqual({
            spaces: { [SPACE]: true },
        });
    });

    it('preserves other spaces when recording a new one', async () => {
        accountData[CANOPY_ONBOARDING_COMPLETED_KEY] = {
            spaces: { '!other:srv': true },
            selections: { '!other:srv': { roles: ['Gardener'], channels: [] } },
        };
        const ref = await renderHook(() => useOnboardingCompletion(SPACE));
        await act(async () => {
            await ref.current.markCompleted({ roles: [], channels: ['#general'] });
        });

        expect(accountData[CANOPY_ONBOARDING_COMPLETED_KEY]).toEqual({
            spaces: { '!other:srv': true, [SPACE]: true },
            selections: {
                '!other:srv': { roles: ['Gardener'], channels: [] },
                [SPACE]: { roles: [], channels: ['#general'] },
            },
        });
    });
});
