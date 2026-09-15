// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchCoalitions: vi.fn(),
    fetchMyInvites: vi.fn(),
    joinCoalition: vi.fn().mockResolvedValue({ joined: true, membership: { role: 'member' } }),
    withdrawJoinRequest: vi.fn().mockResolvedValue({ request: { status: 'withdrawn' } }),
}));

vi.mock('../../../../src/app/features/coalitions/coalitionsClient', () => ({
    fetchCoalitions: (...args: unknown[]) => mocks.fetchCoalitions(...args),
    fetchMyInvites: (...args: unknown[]) => mocks.fetchMyInvites(...args),
    joinCoalition: (...args: unknown[]) => mocks.joinCoalition(...args),
    withdrawJoinRequest: (...args: unknown[]) => mocks.withdrawJoinRequest(...args),
}));

import { MyCoalitionsPanel } from '../../../../src/app/features/coalitions/MyCoalitionsPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const coalition = (id: string, name: string) => ({
    id,
    slug: id,
    name,
    mission: 'A mission',
    joinMode: 'open' as const,
    createdBy: 'founder',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
});

const summary = (id: string, name: string, viewerRole?: string) => ({
    coalition: coalition(id, name),
    memberCount: 4,
    activeCampaigns: 2,
    ...(viewerRole ? { viewerRole } : {}),
});

let root: ReactDOM.Root | null = null;

async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root?.render(
            <MemoryRouter>
                <MyCoalitionsPanel />
            </MemoryRouter>
        );
        await Promise.resolve();
    });
    // Two independent fetches settle (invites + mine).
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
}

beforeEach(() => {
    mocks.fetchCoalitions.mockReset().mockResolvedValue([]);
    mocks.fetchMyInvites.mockReset().mockResolvedValue([]);
    mocks.joinCoalition.mockClear();
    mocks.withdrawJoinRequest.mockClear();
});

afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
});

describe('MyCoalitionsPanel', () => {
    it('lists the viewer coalitions with their role, asking only for their own', async () => {
        mocks.fetchCoalitions.mockResolvedValue([
            summary('river', 'River Keepers', 'steward'),
            summary('mesh', 'Mesh Builders', 'member'),
        ]);
        const container = await mount();

        expect(mocks.fetchCoalitions).toHaveBeenCalledWith({ mine: true });
        const rows = Array.from(container.querySelectorAll('[data-testid="my-coalition-row"]'));
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('River Keepers');
        expect(rows[0].textContent).toContain('Steward');
        expect(rows[1].textContent).toContain('Member');
    });

    it('points a member of nothing at the hub rather than showing an empty list', async () => {
        const container = await mount();
        expect(container.querySelector('[data-testid="my-coalitions-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="coalition-invite"]')).toBeNull();
    });

    it('accepts an invitation by joining, then refreshes both lists', async () => {
        mocks.fetchMyInvites.mockResolvedValue([
            {
                request: {
                    id: 'req-1',
                    coalitionId: 'river',
                    userId: 'me',
                    status: 'invited',
                    createdAt: '',
                },
                coalition: coalition('river', 'River Keepers'),
                invitedBy: { userId: 'f', username: 'founder', matrixUserId: '@founder:server' },
            },
        ]);
        const container = await mount();

        const invite = container.querySelector('[data-testid="coalition-invite"]');
        expect(invite?.textContent).toContain('from founder');

        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="coalition-invite-accept"]')
                ?.click();
            await Promise.resolve();
        });
        expect(mocks.joinCoalition).toHaveBeenCalledWith('river');
    });

    it('declines an invitation by withdrawing it, without joining', async () => {
        mocks.fetchMyInvites.mockResolvedValue([
            {
                request: {
                    id: 'req-1',
                    coalitionId: 'river',
                    userId: 'me',
                    status: 'invited',
                    createdAt: '',
                },
                coalition: coalition('river', 'River Keepers'),
                invitedBy: null,
            },
        ]);
        const container = await mount();

        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="coalition-invite-decline"]')
                ?.click();
            await Promise.resolve();
        });
        expect(mocks.withdrawJoinRequest).toHaveBeenCalledWith('river');
        expect(mocks.joinCoalition).not.toHaveBeenCalled();
    });

    it('degrades to an empty panel when the API is unreachable', async () => {
        mocks.fetchCoalitions.mockRejectedValue(new Error('offline'));
        mocks.fetchMyInvites.mockRejectedValue(new Error('offline'));
        const container = await mount();
        expect(container.querySelector('[data-testid="my-coalitions-panel"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="my-coalitions-empty"]')).not.toBeNull();
    });
});
