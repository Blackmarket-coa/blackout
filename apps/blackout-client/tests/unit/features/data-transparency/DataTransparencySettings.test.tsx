// @vitest-environment jsdom
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshDevices = vi.fn().mockResolvedValue(undefined);

const mx = {
    getUserId: () => '@alice:example.org',
    getDeviceId: () => 'DEVICE_A',
    getHomeserverUrl: () => 'https://hs.example.org',
    getRooms: () => [
        { getMyMembership: () => 'join', isSpaceRoom: () => false },
        { getMyMembership: () => 'join', isSpaceRoom: () => true },
        { getMyMembership: () => 'invite', isSpaceRoom: () => false },
    ],
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => mx,
}));
vi.mock('../../../../src/app/hooks/useDeviceList', () => ({
    useDeviceList: () => [
        [
            {
                device_id: 'DEVICE_A',
                display_name: 'Laptop',
                last_seen_ts: 0,
                last_seen_ip: '1.2.3.4',
            },
            { device_id: 'DEVICE_B', display_name: 'Phone' },
        ],
        refreshDevices,
    ],
}));

import { DataTransparencySettings } from '../../../../src/app/features/data-transparency/DataTransparencySettings';

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<DataTransparencySettings />);
        await Promise.resolve();
    });
    return { container, root };
};

describe('DataTransparencySettings', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('blackout.settings.v1', '{"theme":"dark"}');
        localStorage.setItem('unrelated.key', 'ignored');
    });

    afterEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('renders account, device, room, and local-storage data', async () => {
        const { container, root } = await mount();
        const text = container.textContent ?? '';

        expect(text).toContain('@alice:example.org');
        expect(text).toContain('https://hs.example.org');
        // Device list, with the current device flagged.
        expect(text).toContain('Laptop');
        expect(text).toContain('(this device)');
        expect(text).toContain('Phone');
        // Only blackout.* local keys are surfaced.
        expect(text).toContain('blackout.settings.v1');
        expect(text).not.toContain('unrelated.key');

        await act(async () => {
            root.unmount();
        });
    });

    it('counts joined rooms and spaces separately from invites', async () => {
        const { container, root } = await mount();
        const text = container.textContent ?? '';
        expect(text).toContain('Joined rooms');
        expect(text).toContain('Joined spaces');
        expect(text).toContain('Pending invites');
        await act(async () => {
            root.unmount();
        });
    });
});
