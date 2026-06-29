// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import type { IPowerLevels } from '../../../../src/app/hooks/usePowerLevels';

const mocks = vi.hoisted(() => ({
    powerLevels: {} as IPowerLevels,
    sendStateEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ sendStateEvent: mocks.sendStateEvent }),
}));

vi.mock('../../../../src/app/hooks/usePowerLevels', async (orig) => ({
    ...(await orig<typeof import('../../../../src/app/hooks/usePowerLevels')>()),
    usePowerLevels: () => mocks.powerLevels,
}));

vi.mock('../../../../src/app/hooks/usePowerLevelTags', async (orig) => ({
    ...(await orig<typeof import('../../../../src/app/hooks/usePowerLevelTags')>()),
    usePowerLevelTags: () => ({
        0: { name: 'Member' },
        50: { name: 'Moderator' },
        100: { name: 'Admin' },
    }),
}));

import { DenPermissionsDialog } from '../../../../src/app/features/canopy/DenPermissionsDialog';

const room = { roomId: '!den:server', name: 'general' } as unknown as Room;

const mount = async (onClose = vi.fn()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<DenPermissionsDialog room={room} onClose={onClose} />);
        await Promise.resolve();
    });
    return { container, onClose };
};

beforeEach(() => {
    mocks.powerLevels = { events_default: 0, state_default: 50 };
    mocks.sendStateEvent.mockClear();
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('DenPermissionsDialog', () => {
    it('renders a row per editable permission', async () => {
        const { container } = await mount();
        expect(container.querySelectorAll('[data-testid^="den-permission-select-"]')).toHaveLength(
            6
        );
    });

    it('reflects the current power for each permission', async () => {
        mocks.powerLevels = { events_default: 50, state_default: 100 };
        const { container } = await mount();
        const post = container.querySelector<HTMLSelectElement>(
            '[data-testid="den-permission-select-post"]'
        );
        const manage = container.querySelector<HTMLSelectElement>(
            '[data-testid="den-permission-select-manage"]'
        );
        expect(post?.value).toBe('50');
        expect(manage?.value).toBe('100');
    });

    it('disables save until a change is made, then writes merged power levels', async () => {
        const onClose = vi.fn();
        const { container } = await mount(onClose);

        const save = container.querySelector<HTMLButtonElement>(
            '[data-testid="den-permissions-save"]'
        );
        expect(save?.disabled).toBe(true);

        const post = container.querySelector<HTMLSelectElement>(
            '[data-testid="den-permission-select-post"]'
        );
        await act(async () => {
            post!.value = '50';
            post!.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();
        });

        expect(save?.disabled).toBe(false);
        await act(async () => {
            save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(mocks.sendStateEvent).toHaveBeenCalledWith(
            '!den:server',
            'm.room.power_levels',
            expect.objectContaining({ events_default: 50, state_default: 50 }),
            ''
        );
        expect(onClose).toHaveBeenCalled();
    });

    it('closes via the overlay backdrop', async () => {
        const { container, onClose } = await mount();
        await act(async () => {
            container
                .querySelector('[data-testid="den-permissions-dialog"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onClose).toHaveBeenCalled();
    });
});
