import { describe, expect, it, vi } from 'vitest';
import {
    createReadOnlyMatrixAdapters,
    matrixReadOnlyAdaptersPlugin,
} from '../../../../../src/app/plugins/matrix-adapters';

describe('matrix read-only adapters plugin boundary', () => {
    it('defines register/unregister lifecycle hooks', () => {
        const unregister = matrixReadOnlyAdaptersPlugin.register();

        expect(typeof unregister).toBe('function');
        expect(() => matrixReadOnlyAdaptersPlugin.unregister()).not.toThrow();
    });

    it('returns read-only adapter views without mutating sdk contracts', () => {
        const client = { getRoom: vi.fn(), getRooms: vi.fn() } as any;
        const room = { roomId: '!room:example.org', getJoinedMembers: vi.fn() } as any;
        const event = { getId: vi.fn(() => '$event:example.org') } as any;

        const adapters = createReadOnlyMatrixAdapters(client, room, event);

        expect(adapters.client).toBe(client);
        expect(adapters.room).toBe(room);
        expect(adapters.event).toBe(event);
    });
});
