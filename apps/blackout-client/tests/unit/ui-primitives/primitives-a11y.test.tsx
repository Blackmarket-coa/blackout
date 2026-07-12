// @vitest-environment jsdom
//
// Workstream F accessibility pass over the @blackout/ui overlay primitives:
// focus trapping in Modal/Sheet, focus restore for Menu/Popover, Escape on
// Tooltip, and tone-aware live regions on Toast. Same harness as
// primitives.test.tsx / primitives-b11.test.tsx (raw react-dom root + act,
// primitives imported from source).
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    Menu,
    Modal,
    Popover,
    Sheet,
    ToastProvider,
    Tooltip,
    useToast,
} from '../../../../../packages/ui/src/primitives';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReactDOM.Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const render = (node: React.ReactElement) => {
    act(() => {
        root.render(node);
    });
};

const click = (el: Element | null | undefined) =>
    act(() => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

const pressTab = (shiftKey = false) =>
    act(() => {
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
        );
    });

const pressEscape = () =>
    act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

describe('Modal focus trap', () => {
    it('wraps Tab from the last focusable back to the first', () => {
        render(
            <Modal open onClose={() => {}} title="Trapped">
                <button type="button" data-testid="first">
                    first
                </button>
                <button type="button" data-testid="last">
                    last
                </button>
            </Modal>
        );

        const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!;
        const last = document.querySelector<HTMLButtonElement>('[data-testid="last"]')!;

        act(() => last.focus());
        pressTab();
        expect(document.activeElement).toBe(first);
    });

    it('wraps Shift+Tab from the first focusable to the last', () => {
        render(
            <Modal open onClose={() => {}} title="Trapped">
                <button type="button" data-testid="first">
                    first
                </button>
                <button type="button" data-testid="last">
                    last
                </button>
            </Modal>
        );

        const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!;
        const last = document.querySelector<HTMLButtonElement>('[data-testid="last"]')!;

        act(() => first.focus());
        pressTab(true);
        expect(document.activeElement).toBe(last);
    });

    it('re-enters the dialog when focus escaped somewhere behind it', () => {
        render(
            <>
                <button type="button" data-testid="outside">
                    outside
                </button>
                <Modal open onClose={() => {}} title="Trapped">
                    <button type="button" data-testid="inside">
                        inside
                    </button>
                </Modal>
            </>
        );

        const outside = container.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
        act(() => outside.focus());
        pressTab();
        expect(document.activeElement).toBe(document.querySelector('[data-testid="inside"]'));
    });

    it('parks focus on the dialog itself when nothing inside is tabbable', () => {
        render(
            <Modal open onClose={() => {}} title="Empty">
                <p>plain text</p>
            </Modal>
        );

        pressTab();
        expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
    });
});

describe('Sheet focus trap', () => {
    it('wraps Tab inside the panel', () => {
        render(
            <Sheet open onClose={() => {}} title="Sheet">
                <button type="button" data-testid="s-first">
                    first
                </button>
                <button type="button" data-testid="s-last">
                    last
                </button>
            </Sheet>
        );

        const firstEl = document.querySelector<HTMLButtonElement>('[data-testid="s-first"]')!;
        const lastEl = document.querySelector<HTMLButtonElement>('[data-testid="s-last"]')!;
        act(() => lastEl.focus());
        pressTab();
        expect(document.activeElement).toBe(firstEl);
    });
});

describe('Menu focus management', () => {
    const items = [
        { id: 'a', label: 'Alpha', onSelect: () => {} },
        { id: 'b', label: 'Beta', onSelect: () => {} },
        { id: 'c', label: 'Gamma', onSelect: () => {} },
    ];

    it('restores focus to the trigger when the menu closes', () => {
        render(<Menu trigger={<button type="button">open menu</button>} items={items} />);
        const trigger = container.querySelector('button')!;

        act(() => trigger.focus());
        click(trigger);
        expect(document.activeElement?.textContent).toBe('Alpha');

        pressEscape();
        expect(document.activeElement).toBe(trigger);
    });

    it('supports Home and End to jump to the first / last enabled item', () => {
        render(<Menu trigger={<button type="button">open menu</button>} items={items} />);
        click(container.querySelector('button'));

        const menuItems = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        );
        act(() => {
            menuItems[1]?.focus();
            menuItems[1]?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'End', bubbles: true })
            );
        });
        // React synthetic keydown: dispatch through the element with bubbles so
        // the handler runs; End should land on the last item.
        expect(document.activeElement?.textContent).toBe('Gamma');

        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
            );
        });
        expect(document.activeElement?.textContent).toBe('Alpha');
    });
});

describe('Tooltip Escape dismissal', () => {
    it('hides on Escape without moving focus', () => {
        render(
            <Tooltip content="hint">
                <button type="button">focus me</button>
            </Tooltip>
        );
        const trigger = container.querySelector('button')!;

        act(() => {
            trigger.focus();
            trigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        });
        expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

        pressEscape();
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });
});

describe('Popover focus contract', () => {
    it('moves focus into the surface on open and restores it on close', () => {
        render(
            <Popover trigger={<button type="button">open popover</button>}>
                <p>content</p>
            </Popover>
        );
        const trigger = container.querySelector('button')!;

        act(() => trigger.focus());
        click(trigger);

        const surface = document.querySelector<HTMLElement>('[role="dialog"]');
        expect(surface).not.toBeNull();
        expect(document.activeElement).toBe(surface);

        pressEscape();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });
});

describe('Toast live-region tones', () => {
    const Fire = ({ tone }: { tone: 'neutral' | 'danger' }) => {
        const { toast } = useToast();
        return (
            <button type="button" onClick={() => toast({ message: 'hello', tone, duration: 0 })}>
                fire
            </button>
        );
    };

    it('announces danger toasts assertively and the rest politely', () => {
        render(
            <ToastProvider>
                <Fire tone="neutral" />
            </ToastProvider>
        );
        click(container.querySelector('button'));
        const status = document.querySelector('[role="status"]');
        expect(status).not.toBeNull();
        expect(status?.getAttribute('aria-atomic')).toBe('true');

        act(() => root.unmount());
        root = ReactDOM.createRoot(container);
        render(
            <ToastProvider>
                <Fire tone="danger" />
            </ToastProvider>
        );
        click(container.querySelector('button'));
        expect(document.querySelector('[role="alert"]')).not.toBeNull();
    });
});
