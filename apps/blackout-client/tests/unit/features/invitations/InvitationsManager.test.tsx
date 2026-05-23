// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';

// focus-trap-react's runtime requires that the trapped tree contain at
// least one tabbable element at the moment activation runs. jsdom can't
// always resolve `:focusable` reliably for the rich folds-rendered tree,
// so the trap throws `Your focus-trap must have at least one container…`
// and the test surface becomes about library plumbing, not our component.
// We replace it with a transparent passthrough — the dialog still renders,
// the trap behavior is just verified elsewhere (LoginForm.test.tsx and the
// dedicated reliability harness).
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const listMyInvitationsMock = vi.fn();
const createInvitationMock = vi.fn();
const revokeInvitationMock = vi.fn();
const getBotUserIdMock = vi.fn().mockResolvedValue({ userId: '@blackout:server' });
const inviteMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../src/app/features/invitations/invitationsClient', () => ({
    listMyInvitations: (...args: unknown[]) => listMyInvitationsMock(...args),
    createInvitation: (...args: unknown[]) => createInvitationMock(...args),
    revokeInvitation: (...args: unknown[]) => revokeInvitationMock(...args),
    getBotUserId: (...args: unknown[]) => getBotUserIdMock(...args),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ invite: (...args: unknown[]) => inviteMock(...args) }),
}));

vi.mock('../../../../src/app/components/confirm-dialog/useConfirm', () => ({
    useConfirm: () => async (opts: { onConfirm: () => Promise<void> | void }) => {
        await opts.onConfirm();
    },
}));

import { InvitationsManager } from '../../../../src/app/components/invitations/InvitationsManager';
import { renderDialog } from '../../helpers/modalReliability';

const flush = async () => {
    await act(async () => {
        // Two microtask drains: one for the fetch promise, one for state-update effects.
        await Promise.resolve();
        await Promise.resolve();
    });
};

const sampleInvitation = (
    overrides: Partial<{
        id: string;
        label: string;
        maxUses: number;
        useCount: number;
        usesRemaining: number;
        redemptions: Array<{ userId: string; username: string; at: string; matrixInviteOk?: boolean }>;
    }> = {},
) => ({
    id: overrides.id ?? 'inv-1',
    label: overrides.label ?? 'sample-label',
    maxUses: overrides.maxUses ?? 5,
    useCount: overrides.useCount ?? 1,
    usesRemaining: overrides.usesRemaining ?? 4,
    expiresAt: undefined,
    revokedAt: undefined,
    createdAt: '2024-01-01T00:00:00Z',
    redemptions: overrides.redemptions ?? [],
});

let clipboardWriteText: ReturnType<typeof vi.fn>;

beforeEach(() => {
    listMyInvitationsMock.mockReset();
    createInvitationMock.mockReset();
    revokeInvitationMock.mockReset();
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: clipboardWriteText },
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('InvitationsManager', () => {
    it('auto-copies the invite URL once after a successful create', async () => {
        listMyInvitationsMock.mockResolvedValue({ invitations: [] });
        createInvitationMock.mockResolvedValue({
            invitation: sampleInvitation({ id: 'created-1', useCount: 0, usesRemaining: 1 }),
            token: 'plaintext-token',
            url: 'https://blackout.test/invite/plaintext-token',
        });

        const mounted = await renderDialog(<InvitationsManager requestClose={() => undefined} />);
        await flush();

        const submit = document.body.querySelector(
            'button[type="submit"]',
        ) as HTMLButtonElement | null;
        expect(submit, 'expected a submit button on the create form').not.toBeNull();

        // The form's `onSubmit` handler is what we want — clicking the submit
        // button dispatches the native submit event in jsdom.
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });
        await flush();

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect(clipboardWriteText).toHaveBeenCalledWith(
            'https://blackout.test/invite/plaintext-token',
        );

        // Re-rendering with the same `created` should NOT re-copy — the
        // useRef guard in InvitationsManager pins this regression boundary.
        await mounted.rerender(<InvitationsManager requestClose={() => undefined} />);
        await flush();
        expect(clipboardWriteText).toHaveBeenCalledTimes(1);

        mounted.unmount();
    });

    it('renders @username · timestamp for each redemption', async () => {
        const at = '2024-01-01T00:00:00Z';
        listMyInvitationsMock.mockResolvedValue({
            invitations: [
                sampleInvitation({
                    id: 'inv-redeemed',
                    label: 'launch',
                    redemptions: [
                        { userId: 'u-bob', username: 'bob-redeemer', at, matrixInviteOk: true },
                    ],
                }),
            ],
        });

        const mounted = await renderDialog(<InvitationsManager requestClose={() => undefined} />);
        await flush();

        const text = document.body.textContent ?? '';
        expect(text).toMatch(/@bob-redeemer/);
        expect(text).toContain(new Date(at).toLocaleString());

        mounted.unmount();
    });

    it('renders the friendly error message when the list fetch fails', async () => {
        listMyInvitationsMock.mockRejectedValue(
            new Error('HTTP_BAD_RESPONSE: Expected JSON from /v1/invitations but got text/html'),
        );

        const mounted = await renderDialog(<InvitationsManager requestClose={() => undefined} />);
        await flush();

        const text = document.body.textContent ?? '';
        expect(text).toMatch(/Could not load your invite links/);
        // The raw SDK error must not leak into the UI — that was the
        // regression PR #678 first fixed; this test pins it.
        expect(text).not.toContain('HTTP_BAD_RESPONSE');
        expect(text).not.toContain('Unexpected token');

        mounted.unmount();
    });
});
