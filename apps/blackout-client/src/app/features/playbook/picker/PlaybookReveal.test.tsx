// @vitest-environment jsdom
/**
 * The playbook reveal plants a den with no access chooser, so what it sends
 * is what the den gets: the kind and encryption from the one table in
 * `newRoomDefaults.ts`, per surface and parent canopy. Encryption no longer
 * follows the playbook's `governanceActive` flag (which left a "Hearth" den
 * private and plaintext).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Capabilities, MatrixClient, Room } from 'matrix-js-sdk';

const createRoomMock = vi.fn(async () => '!new:server');
vi.mock('../../../components/create-room', async (importOriginal: () => Promise<object>) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createRoom: (...args: unknown[]) => createRoomMock(...(args as [])),
    };
});
vi.mock('../usePlaybook', () => ({
    useSetAnyPlaybook: () => vi.fn(async () => undefined),
}));
vi.mock('../../documents/useDenDocuments', () => ({
    useUpsertAnyDocument: () => vi.fn(async () => undefined),
}));

import { PlaybookReveal } from './PlaybookReveal';
import { MatrixClientProvider } from '../../../hooks/useMatrixClient';
import { CapabilitiesProvider } from '../../../hooks/useCapabilities';
import {
    CreateRoomKind,
    setNewRoomSurfaceForTests,
    type NewRoomSurface,
} from '../../../components/create-room';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CAPABILITIES = {
    'm.room_versions': { default: '10', available: { '10': 'stable' } },
} as unknown as Capabilities;

const fakeCanopy = (joinRule: string): Room =>
    ({
        roomId: '!canopy:server',
        name: 'Garden Co-op',
        getJoinRule: () => joinRule,
        getType: () => 'm.space',
    } as unknown as Room);

const mx = {
    getUserId: () => '@alice:server',
} as unknown as MatrixClient;

const mounted: Array<{ root: ReactDOM.Root; container: HTMLElement }> = [];

const plant = async (surface: NewRoomSurface, space?: Room, version = '10') => {
    setNewRoomSurfaceForTests(surface);
    const capabilities =
        version === '10'
            ? CAPABILITIES
            : ({
                  'm.room_versions': { default: version, available: {} },
              } as unknown as Capabilities);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push({ root, container });
    await act(async () => {
        root.render(
            <MatrixClientProvider value={mx}>
                <CapabilitiesProvider value={capabilities}>
                    {/* Hearth: the one playbook whose governanceActive is false. */}
                    <PlaybookReveal
                        playbookId="hearth"
                        space={space}
                        onCreate={vi.fn()}
                        onBack={vi.fn()}
                        onCustom={vi.fn()}
                    />
                </CapabilitiesProvider>
            </MatrixClientProvider>
        );
    });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    const [, data] = createRoomMock.mock.calls[0] as unknown as [
        MatrixClient,
        { kind: CreateRoomKind; encryption?: boolean; parent?: Room }
    ];
    return data;
};

beforeEach(() => {
    createRoomMock.mockClear();
});

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
    vi.unstubAllEnvs();
    setNewRoomSurfaceForTests(null);
});

describe('PlaybookReveal plants with the table’s defaults', () => {
    it('app, no canopy: public and not encrypted', async () => {
        const data = await plant('app');
        expect(data.kind).toBe(CreateRoomKind.Public);
        expect(data.encryption).toBe(false);
    });

    it('panel, no canopy: private and encrypted (Hearth included)', async () => {
        const data = await plant('panel');
        expect(data.kind).toBe(CreateRoomKind.Private);
        expect(data.encryption).toBe(true);
    });

    it('app, inside a public canopy: public and not encrypted', async () => {
        const data = await plant('app', fakeCanopy('public'));
        expect(data.kind).toBe(CreateRoomKind.Public);
        expect(data.encryption).toBe(false);
        expect(data.parent?.roomId).toBe('!canopy:server');
    });

    it('panel, inside a public canopy: restricted to it and encrypted', async () => {
        const data = await plant('panel', fakeCanopy('public'));
        expect(data.kind).toBe(CreateRoomKind.Restricted);
        expect(data.encryption).toBe(true);
    });

    it('inside a canopy that is not public: restricted and encrypted on both surfaces', async () => {
        const app = await plant('app', fakeCanopy('invite'));
        expect(app.kind).toBe(CreateRoomKind.Restricted);
        expect(app.encryption).toBe(true);
        createRoomMock.mockClear();
        const panel = await plant('panel', fakeCanopy('restricted'));
        expect(panel.kind).toBe(CreateRoomKind.Restricted);
        expect(panel.encryption).toBe(true);
    });

    it('falls back to private when the room version has no restricted rule', async () => {
        const data = await plant('app', fakeCanopy('invite'), '1');
        expect(data.kind).toBe(CreateRoomKind.Private);
        expect(data.encryption).toBe(true);
    });

    it('the build-time switch set to private makes the app plant like the panel', async () => {
        vi.stubEnv('VITE_BLACKOUT_NEW_ROOM_DEFAULT', 'private');
        const data = await plant('app');
        expect(data.kind).toBe(CreateRoomKind.Private);
        expect(data.encryption).toBe(true);
    });
});
