import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { removeDenFromCanopy, renameDen } from '../../../../src/app/features/canopy/denKind';

describe('removeDenFromCanopy', () => {
    it('clears the m.space.child edge on the canopy and leaves the den', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const leave = vi.fn().mockResolvedValue(undefined);
        const mx = { sendStateEvent, leave } as unknown as MatrixClient;

        await removeDenFromCanopy(mx, { canopyId: '!canopy:server', denId: '!den:server' });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            {},
            '!den:server'
        );
        expect(leave).toHaveBeenCalledWith('!den:server');
    });

    it('still unlinks the child when leaving the den fails', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const leave = vi.fn().mockRejectedValue(new Error('not a member'));
        const mx = { sendStateEvent, leave } as unknown as MatrixClient;

        await expect(
            removeDenFromCanopy(mx, { canopyId: '!canopy:server', denId: '!den:server' })
        ).resolves.toBeUndefined();
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            {},
            '!den:server'
        );
    });
});

describe('renameDen', () => {
    it('writes a trimmed m.room.name state event on the den', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const mx = { sendStateEvent } as unknown as MatrixClient;

        await renameDen(mx, { denId: '!den:server', name: '  general  ' });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!den:server',
            'm.room.name',
            { name: 'general' },
            ''
        );
    });
});
