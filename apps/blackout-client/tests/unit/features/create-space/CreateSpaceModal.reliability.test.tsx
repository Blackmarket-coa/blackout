// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const closeMock = vi.fn();
const stateMock = vi.fn();

// CreateSpaceModal doesn't set `tabbableOptions.displayCheck: 'none'` on
// focus-trap-react. Under JSDOM every element is zero-size, so tabbable
// rejects them all and the trap throws "must have at least one
// tabbable node". The contract under test here is the dialog's
// open/close wiring — not focus-trap-react's runtime — so we replace
// it with a pass-through that renders children.
vi.mock('focus-trap-react', () => {
    const FocusTrap = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    return { __esModule: true, default: FocusTrap };
});

vi.mock('../../../../src/app/state/hooks/createSpaceModal', () => ({
    useCreateSpaceModalState: () => stateMock(),
    useCloseCreateSpaceModal: () => closeMock,
}));
vi.mock('../../../../src/app/hooks/useGetRoom', () => ({
    useAllJoinedRoomsSet: () => new Set<string>(),
    useGetRoom: () => () => undefined,
}));
vi.mock('../../../../src/app/features/create-space/CreateSpace', () => ({
    // The stub renders a focusable element so any downstream code that
    // looks for a tabbable node has one to anchor on.
    CreateSpaceForm: () => (
        <button type="button" data-testid="create-space-form-stub">
            stub
        </button>
    ),
}));

import { CreateSpaceModalRenderer } from '../../../../src/app/features/create-space/CreateSpaceModal';
import { renderDialog } from '../../helpers/modalReliability';

describe('CreateSpaceModal reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        closeMock.mockReset();
        stateMock.mockReset();
    });

    const findOverlayDialog = () =>
        document.body.querySelector('[role="dialog"]') as HTMLElement | null;

    it('row 1 — renders nothing when no modal state is set', async () => {
        stateMock.mockReturnValue(undefined);
        const mounted = await renderDialog(<CreateSpaceModalRenderer />);
        expect(findOverlayDialog()).toBeNull();
        mounted.unmount();
    });

    it('row 2 — renders the dialog with role=dialog when modal state is set', async () => {
        stateMock.mockReturnValue({ spaceId: undefined });
        const mounted = await renderDialog(<CreateSpaceModalRenderer />);
        const dialog = findOverlayDialog();
        expect(dialog).not.toBeNull();
        expect(dialog!.getAttribute('aria-labelledby')).toBeTruthy();
        mounted.unmount();
    });

    it('row 4 — the inline close (X) button fires the close callback', async () => {
        stateMock.mockReturnValue({ spaceId: undefined });
        const mounted = await renderDialog(<CreateSpaceModalRenderer />);
        const buttons = Array.from(document.body.querySelectorAll('button'));
        expect(buttons.length).toBeGreaterThan(0);
        buttons[0].click();
        expect(closeMock).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 7 — backdrop sits at zIndex 9999, dims the page, and closes on click', async () => {
        stateMock.mockReturnValue({ spaceId: undefined });
        const mounted = await renderDialog(<CreateSpaceModalRenderer />);
        try {
            const backdrop = document.body.querySelector(
                '[data-testid="modal-createSpace-backdrop"]'
            ) as HTMLElement | null;
            expect(backdrop, 'backdrop must render').not.toBeNull();

            const root = backdrop!.parentElement as HTMLElement;
            expect(root.style.position).toBe('fixed');
            expect(root.style.zIndex).toBe('9999');

            expect(backdrop!.style.background).toMatch(/rgba\(0,\s*0,\s*0,\s*0?\.5\d?\)/);
            expect(backdrop!.style.pointerEvents).toBe('auto');

            backdrop!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            expect(closeMock).toHaveBeenCalled();
        } finally {
            mounted.unmount();
        }
    });

    it('row 8 — mousedown on dialog content does NOT bubble to the backdrop', async () => {
        stateMock.mockReturnValue({ spaceId: undefined });
        const mounted = await renderDialog(<CreateSpaceModalRenderer />);
        try {
            const dialog = findOverlayDialog();
            expect(dialog).not.toBeNull();
            dialog!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            expect(closeMock).not.toHaveBeenCalled();
        } finally {
            mounted.unmount();
        }
    });
});
