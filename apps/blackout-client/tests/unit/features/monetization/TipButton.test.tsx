// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TipButton } from '../../../../src/app/features/monetization/components/TipButton';

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function mount(node: React.ReactNode): HTMLElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
    flushSync(() => {
        root.render(node);
    });
    return container;
}

describe('TipButton', () => {
    it('renders a closed trigger with the default label', () => {
        const container = mount(
            <TipButton recipientUserId="creator-1" recipientLabel="Creator" contextKind="profile" />,
        );
        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="tip-button"]');
        expect(trigger).not.toBeNull();
        expect(trigger!.textContent).toContain('Send a tip');
        expect(trigger!.getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('opens the popover with quick-amount chips when clicked', () => {
        const container = mount(
            <TipButton
                recipientUserId="creator-1"
                recipientLabel="Creator"
                contextKind="stream"
                contextRef="stream-abc"
            />,
        );
        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="tip-button"]');
        flushSync(() => {
            trigger!.click();
        });
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        expect(dialog!.textContent).toContain('Tip Creator');
        expect(dialog!.textContent).toContain('FreeBlackMarket takes a flat 3%');
        // Default quick amounts include $1.00 and $25.00
        expect(dialog!.textContent).toContain('$1.00');
        expect(dialog!.textContent).toContain('$25.00');
    });

    it('renders the compact label when compact=true', () => {
        const container = mount(
            <TipButton recipientUserId="creator-1" contextKind="post" compact />,
        );
        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="tip-button"]');
        expect(trigger!.textContent).toContain('$ Tip');
    });
});
