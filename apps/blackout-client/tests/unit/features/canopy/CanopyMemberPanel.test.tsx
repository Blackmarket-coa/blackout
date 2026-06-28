// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

// Stub ConnectedProfileModal so the test is about the panel's open-on-click
// wiring, not the matrix-client / friends / profile-action tree the real
// connected modal pulls in.
vi.mock('../../../../src/app/features/profile/ConnectedProfileModal', () => ({
    ConnectedProfileModal: ({ profile }: { profile: { userId: string } }) => (
        <div data-testid="profile-modal">{profile.userId}</div>
    ),
}));

// The Friends dialog only renders when opened; stub it so its matrix/account-data
// hooks never run in this isolated panel render.
vi.mock('../../../../src/app/features/friends/FriendsDialog', () => ({
    FriendsDialog: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="friends-dialog">
            <button type="button" data-testid="friends-close" onClick={onClose}>
                close
            </button>
        </div>
    ),
}));

vi.mock('../../../../src/app/hooks/useUserPresence', () => ({
    Presence: { Online: 'online', Unavailable: 'unavailable', Offline: 'offline' },
    useUserPresence: () => ({ presence: 'online' }),
}));

vi.mock('../../../../src/app/hooks/usePowerLevels', () => ({
    usePowerLevels: () => ({}),
}));

vi.mock('../../../../src/app/hooks/usePowerLevelTags', () => ({
    usePowerLevelTags: () => [],
    getPowerLevelTag: () => ({ name: 'Member' }),
}));

vi.mock('../../../../src/app/features/right-panel/rightPanelUtils', () => ({
    groupMembersByPresence: (members: unknown[]) => ({ online: members, away: [], offline: [] }),
}));

// Profile actions use useRoomNavigate (react-router) + account data, neither of
// which this isolated render provides; stub to keep the test about row → modal.
vi.mock('../../../../src/app/features/profile/useProfileActions', () => ({
    useProfileActions: () => ({ startDm: vi.fn(), block: vi.fn() }),
}));

import { CanopyMemberPanel } from '../../../../src/app/features/canopy/CanopyMemberPanel';

const member = {
    userId: '@alice:server',
    name: 'Alice',
    powerLevel: 0,
    getMxcAvatarUrl: () => undefined,
};

const room = { getJoinedMembers: () => [member] } as unknown as Room;

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CanopyMemberPanel room={room} />);
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopyMemberPanel', () => {
    it('renders each member as a clickable button with a presence dot', async () => {
        const { container } = await mount();
        const row = container.querySelector('[data-testid="canopy-member-row"]');
        expect(row).not.toBeNull();
        expect(row?.tagName).toBe('BUTTON');
        expect(container.querySelector('[data-testid="canopy-member-presence"]')).not.toBeNull();
    });

    it('opens the profile modal for the clicked member', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="profile-modal"]')).toBeNull();

        const row = container.querySelector<HTMLButtonElement>('[data-testid="canopy-member-row"]');
        await act(async () => {
            row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        const modal = container.querySelector('[data-testid="profile-modal"]');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toBe('@alice:server');
    });

    it('opens and closes the friends dialog from the header button', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="friends-dialog"]')).toBeNull();

        const open = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-friends-open"]'
        );
        await act(async () => {
            open?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="friends-dialog"]')).not.toBeNull();

        const close = container.querySelector<HTMLButtonElement>('[data-testid="friends-close"]');
        await act(async () => {
            close?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="friends-dialog"]')).toBeNull();
    });
});
