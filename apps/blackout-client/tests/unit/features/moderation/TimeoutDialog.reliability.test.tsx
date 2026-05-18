// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getRoom: () => null,
        getUserId: () => '@admin:example.org',
        sendStateEvent: vi.fn(async () => undefined),
    }),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({
        data: {
            currentState: {
                getStateEvents: () => undefined,
            },
        },
    }),
}));

import { TimeoutDialog } from '../../../../src/app/features/moderation/TimeoutDialog';
import {
    renderDialog,
    pressEscape,
    findDialog,
    queryDialog,
    expectFocusTrapWired,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

const baseProps = {
    roomId: '!room:example.org',
    targetUserId: '@target:example.org',
    onClose: () => undefined,
};

describe('TimeoutDialog reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('row 1 — opens with role=dialog, aria-modal, aria-labelledby', async () => {
        const mounted = await renderDialog(<TimeoutDialog {...baseProps} open />);
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        const label = labelledBy ? document.getElementById(labelledBy) : null;
        expect(label?.textContent).toBe('Timeout user');
        mounted.unmount();
    });

    it('row 2 — Escape fires onClose', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(<TimeoutDialog {...baseProps} open onClose={onClose} />);
        await pressEscape();
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 3 — backdrop click fires onClose', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(<TimeoutDialog {...baseProps} open onClose={onClose} />);
        findDialog(mounted.container).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 4 — focus trap wiring', async () => {
        const mounted = await renderDialog(<TimeoutDialog {...baseProps} open />);
        expectFocusTrapWired(findDialog(mounted.container));
        mounted.unmount();
    });

    it('row 5 — closed state renders no dialog and leaks no window listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(<TimeoutDialog {...baseProps} open={false} />);
            expect(queryDialog(mounted.container)).toBeNull();
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam open/close 20 cycles leaks no listeners', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            const onClose = vi.fn();
            const mounted = await renderDialog(
                <TimeoutDialog {...baseProps} open={false} onClose={onClose} />,
            );
            for (let i = 0; i < 20; i += 1) {
                await mounted.rerender(<TimeoutDialog {...baseProps} open onClose={onClose} />);
                await mounted.rerender(
                    <TimeoutDialog {...baseProps} open={false} onClose={onClose} />,
                );
            }
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
            const hard = errors.errors.filter((e) => !/focus-trap|tabbable/i.test(e));
            expect(hard).toEqual([]);
        } finally {
            restore();
            errors.restore();
        }
    });
});
