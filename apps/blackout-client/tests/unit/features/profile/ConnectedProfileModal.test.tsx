// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchCoalitions: vi.fn(),
    inviteToCoalition: vi.fn().mockResolvedValue({ request: { id: 'req' } }),
    followUser: vi.fn().mockResolvedValue({ ok: true, following: true, created: true }),
}));

vi.mock('../../../../src/app/features/profile/useProfileActions', () => ({
    useProfileActions: () => ({ startDm: vi.fn(), block: vi.fn() }),
}));

vi.mock('../../../../src/app/features/coalitions/coalitionsClient', () => ({
    fetchCoalitions: (...args: unknown[]) => mocks.fetchCoalitions(...args),
    inviteToCoalition: (...args: unknown[]) => mocks.inviteToCoalition(...args),
}));

vi.mock('../../../../src/app/features/profile/profileClient', () => ({
    followUser: (...args: unknown[]) => mocks.followUser(...args),
}));

// Stub the presentational modal: this test is about ConnectedProfileModal's
// action wiring, not the modal's rendering tree.
vi.mock('../../../../src/app/features/profile/ProfileModal', () => ({
    ProfileModal: ({
        profile,
        onInviteToCoalition,
        inviteSent,
    }: {
        profile: { userId: string };
        onInviteToCoalition?: (userId: string) => void;
        inviteSent?: boolean;
    }) => (
        <div data-testid="profile-modal-stub">
            {onInviteToCoalition ? (
                <button
                    type="button"
                    data-testid="invite-button"
                    onClick={() => onInviteToCoalition(profile.userId)}
                >
                    {inviteSent ? 'Invited' : 'Invite to coalition'}
                </button>
            ) : (
                <span data-testid="no-invite">no invite</span>
            )}
        </div>
    ),
}));

import { ConnectedProfileModal } from '../../../../src/app/features/profile/ConnectedProfileModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const profile = {
    userId: '@friend:server',
    displayName: 'Friend',
    isFriend: false,
    profile: {},
} as unknown as Parameters<typeof ConnectedProfileModal>[0]['profile'];

const summary = (id: string, name: string, viewerRole?: string) => ({
    coalition: {
        id,
        slug: id,
        name,
        mission: '',
        joinMode: 'open',
        createdBy: 'me',
        createdAt: '',
        updatedAt: '',
    },
    memberCount: 1,
    activeCampaigns: 0,
    ...(viewerRole ? { viewerRole } : {}),
});

let root: ReactDOM.Root | null = null;

async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root?.render(<ConnectedProfileModal profile={profile} onClose={() => undefined} />);
        await Promise.resolve();
    });
    return container;
}

beforeEach(() => {
    mocks.fetchCoalitions.mockReset();
    mocks.inviteToCoalition.mockClear();
    mocks.followUser.mockClear();
});

afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
});

describe('ConnectedProfileModal invite wiring', () => {
    it('offers an invite only when the viewer can invite somewhere, and sends it on pick', async () => {
        mocks.fetchCoalitions.mockResolvedValue([
            summary('coa-1', 'River Keepers', 'steward'),
            summary('coa-2', 'Just a member', 'member'),
        ]);
        const container = await mount();

        await act(async () => {
            container.querySelector<HTMLButtonElement>('[data-testid="invite-button"]')?.click();
            await Promise.resolve();
        });
        const options = Array.from(
            container.querySelectorAll<HTMLButtonElement>('[data-testid="coalition-invite-option"]')
        );
        expect(options.map((o) => o.textContent)).toEqual(['River Keepers']);

        await act(async () => {
            options[0].click();
            await Promise.resolve();
        });
        expect(mocks.inviteToCoalition).toHaveBeenCalledWith('coa-1', '@friend:server');
        expect(mocks.followUser).toHaveBeenCalledWith('@friend:server');
        expect(container.querySelector('[data-testid="invite-button"]')?.textContent).toBe(
            'Invited'
        );
    });

    it('hides the invite action for viewers who cannot invite anywhere', async () => {
        mocks.fetchCoalitions.mockResolvedValue([summary('coa-2', 'Just a member', 'member')]);
        const container = await mount();
        expect(container.querySelector('[data-testid="no-invite"]')).not.toBeNull();
    });

    it('does not surface a follow failure — the invitation stands alone', async () => {
        mocks.fetchCoalitions.mockResolvedValue([summary('coa-1', 'River Keepers', 'founder')]);
        mocks.followUser.mockRejectedValue(new Error('no blackout token'));
        const container = await mount();
        await act(async () => {
            container.querySelector<HTMLButtonElement>('[data-testid="invite-button"]')?.click();
            await Promise.resolve();
        });
        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="coalition-invite-option"]')
                ?.click();
            await Promise.resolve();
        });
        expect(mocks.inviteToCoalition).toHaveBeenCalledTimes(1);
    });
});
