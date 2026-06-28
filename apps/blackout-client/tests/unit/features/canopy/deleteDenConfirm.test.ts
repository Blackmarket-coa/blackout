import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { buildDeleteDenConfirm } from '../../../../src/app/features/canopy/CanopyChannelSidebar';

describe('buildDeleteDenConfirm', () => {
    it('produces a Critical confirm whose onConfirm deletes the den', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const leave = vi.fn().mockResolvedValue(undefined);
        const mx = { sendStateEvent, leave } as unknown as MatrixClient;

        const options = buildDeleteDenConfirm(mx, {
            canopyId: '!canopy:server',
            canopyName: 'Test Canopy',
            denId: '!den:server',
            denName: 'general',
        });

        expect(options.variant).toBe('Critical');
        expect(options.confirmLabel).toBe('Delete');
        expect(options.title).toContain('general');

        // The destructive action runs only when the dialog invokes onConfirm.
        expect(sendStateEvent).not.toHaveBeenCalled();
        await options.onConfirm?.();
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            {},
            '!den:server'
        );
    });
});
