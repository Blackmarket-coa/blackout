// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

// The reveal screen wires `createRoom`, `useMatrixClient`, `useCapabilities`,
// and `useSetAnyPlaybook` — heavy machinery that's irrelevant to the
// step-machine the picker contributes. Stub the reveal so the test only
// asserts the resolution + custom-escape behavior.
vi.mock('../../../../src/app/features/playbook/picker/PlaybookReveal', () => ({
    PlaybookReveal: ({
        playbookId,
        onCustom,
        onBack,
    }: {
        playbookId: string;
        onCustom: () => void;
        onBack: () => void;
    }) => (
        <div data-testid="reveal" data-playbook-id={playbookId}>
            <button type="button" data-testid="reveal-back" onClick={onBack}>
                back
            </button>
            <button type="button" data-testid="reveal-custom" onClick={onCustom}>
                custom
            </button>
        </div>
    ),
}));

// CreateRoomForm transitively loads matrix-js-sdk and a wide set of Folds
// state. Stub it to a sentinel so the test only confirms the picker mounts
// the legacy form when the Custom escape is taken.
vi.mock('../../../../src/app/features/create-room/CreateRoom', () => ({
    CreateRoomForm: () => <div data-testid="create-room-form" />,
}));

import { PlaybookPicker } from '../../../../src/app/features/playbook/picker/PlaybookPicker';

const flush = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
    }
};

const click = async (el: HTMLElement | null) => {
    if (!el) throw new Error('click target was null');
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
    });
};

const findButtonByText = (root: HTMLElement, text: string): HTMLButtonElement | null => {
    const buttons = Array.from(root.querySelectorAll('button'));
    return (buttons.find((btn) => btn.textContent?.includes(text)) ?? null) as HTMLButtonElement | null;
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<PlaybookPicker onCreate={() => undefined} />);
        await flush();
    });
    return { container, root };
};

describe('PlaybookPicker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('walks size → decisions → resources → reveal and resolves the playbook id', async () => {
        const { container } = await mount();

        // Q1: pick "A handful" (small).
        await click(findButtonByText(container, 'A handful'));
        await click(findButtonByText(container, 'Next'));

        // Q2: pick "We all need to agree" (all_agree).
        await click(findButtonByText(container, 'We all need to agree'));
        await click(findButtonByText(container, 'Next'));

        // Q3: pick "We chip into a shared kitty" (kitty).
        await click(findButtonByText(container, 'We chip into a shared kitty'));
        await click(findButtonByText(container, 'See our playbook'));

        const reveal = container.querySelector('[data-testid="reveal"]');
        expect(reveal).not.toBeNull();
        // (small, all_agree, kitty) resolves to Circle per the deterministic table.
        expect(reveal?.getAttribute('data-playbook-id')).toBe('circle');
    });

    it('disables Next until the current step has an answer', async () => {
        const { container } = await mount();
        const nextButton = findButtonByText(container, 'Next');
        expect(nextButton?.disabled).toBe(true);

        await click(findButtonByText(container, 'A few of us'));
        const enabledNext = findButtonByText(container, 'Next');
        expect(enabledNext?.disabled).toBe(false);
    });

    it('Custom / Advanced from the picker mounts CreateRoomForm', async () => {
        const { container } = await mount();

        // The picker has its own Custom chip on every step.
        await click(findButtonByText(container, 'Custom / Advanced'));

        expect(container.querySelector('[data-testid="create-room-form"]')).not.toBeNull();
    });

    it('reveal-custom from the reveal screen also mounts CreateRoomForm', async () => {
        const { container } = await mount();

        await click(findButtonByText(container, 'A handful'));
        await click(findButtonByText(container, 'Next'));
        await click(findButtonByText(container, 'We all need to agree'));
        await click(findButtonByText(container, 'Next'));
        await click(findButtonByText(container, 'We chip into a shared kitty'));
        await click(findButtonByText(container, 'See our playbook'));

        const customButton = container.querySelector(
            '[data-testid="reveal-custom"]'
        ) as HTMLButtonElement | null;
        await click(customButton);

        expect(container.querySelector('[data-testid="create-room-form"]')).not.toBeNull();
    });
});
