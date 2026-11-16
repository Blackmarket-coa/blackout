// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
    TipButton,
    tipRecordedMessage,
} from '../../../../src/app/features/monetization/components/TipButton';

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
            <TipButton recipientUserId="creator-1" recipientLabel="Creator" contextKind="profile" />
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
            />
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
            <TipButton recipientUserId="creator-1" contextKind="post" compact />
        );
        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="tip-button"]');
        expect(trigger!.textContent).toContain('$ Tip');
    });
});

/**
 * Creating a tip records it as pending; this app opens no checkout for it, so
 * nothing is charged and nobody is paid. The popover said "Sent $5.00 —
 * they'll receive $4.85" all the same. docs/security/trust-claims-2026-11-16.md.
 */
describe('what the popover says once a tip is recorded', () => {
    it('says no payment has been taken, and does not say the tip was sent', () => {
        const message = tipRecordedMessage('$5.00', '$4.85', 'Creator');
        expect(message).toBe(
            'Tip of $5.00 to Creator recorded as pending. ' +
                'No payment has been taken: checkout for tips is not connected yet, so you have not been charged and Creator has not been paid. ' +
                'Once it is paid, Creator receives $4.85 after the 3% platform fee.'
        );
        expect(message).not.toMatch(/\bSent\b/);
    });

    it('reads the same without a recipient name', () => {
        expect(tipRecordedMessage('$1.00', '$0.97')).toBe(
            'Tip of $1.00 recorded as pending. ' +
                'No payment has been taken: checkout for tips is not connected yet, so you have not been charged and the recipient has not been paid. ' +
                'Once it is paid, the recipient receives $0.97 after the 3% platform fee.'
        );
    });

    it('is what the popover shows after the API takes the tip', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    tip: {
                        id: 't1',
                        grossCents: 100,
                        feeCents: 3,
                        netCents: 97,
                        status: 'pending',
                    },
                }),
                { status: 201, headers: { 'content-type': 'application/json' } }
            )
        );
        const container = mount(
            <TipButton recipientUserId="creator-1" recipientLabel="Creator" contextKind="stream" />
        );
        flushSync(() => {
            container.querySelector<HTMLButtonElement>('[data-testid="tip-button"]')!.click();
        });
        const form = container.querySelector<HTMLFormElement>('form[role="dialog"]')!;
        flushSync(() => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        for (
            let i = 0;
            i < 50 && !container.querySelector('[data-testid="tip-recorded-notice"]');
            i += 1
        ) {
            await new Promise((r) => setTimeout(r, 10));
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const notice = container.querySelector('[data-testid="tip-recorded-notice"]');
        // The popover's default amount is its first quick amount, $1.00.
        expect(notice?.textContent).toBe(tipRecordedMessage('$1.00', '$0.97', 'Creator'));
        expect(container.textContent).not.toMatch(/\bSent \$/);
    });
});
