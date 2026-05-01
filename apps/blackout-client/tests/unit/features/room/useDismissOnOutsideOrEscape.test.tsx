// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { useRef } from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

import { useDismissOnOutsideOrEscape } from '../../../../src/app/features/room/useDismissOnOutsideOrEscape';

interface HarnessProps {
    active: boolean;
    onDismiss: () => void;
    useRefForOutside: boolean;
}

const Harness = ({ active, onDismiss, useRefForOutside }: HarnessProps) => {
    const popoverRef = useRef<HTMLDivElement | null>(null);
    useDismissOnOutsideOrEscape(active, useRefForOutside ? popoverRef : null, onDismiss);
    return (
        <div>
            <div data-testid="outside-area">outside</div>
            <div ref={popoverRef} data-testid="popover">
                <button type="button" data-testid="inside-button">
                    inside
                </button>
            </div>
        </div>
    );
};

let containers: HTMLElement[] = [];
let roots: ReactDOM.Root[] = [];

const mount = (ui: React.ReactElement): { container: HTMLElement; rerender: (next: React.ReactElement) => void; unmount: () => void } => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(ui);
    });
    containers.push(container);
    roots.push(root);
    return {
        container,
        rerender: (next) => {
            act(() => {
                root.render(next);
            });
        },
        unmount: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
};

const dispatchPointerDown = (target: EventTarget) => {
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: target, configurable: true });
    act(() => {
        window.dispatchEvent(event);
    });
};

const dispatchEscape = (defaultPrevented = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    if (defaultPrevented) {
        event.preventDefault();
    }
    act(() => {
        window.dispatchEvent(event);
    });
};

afterEach(() => {
    for (const root of roots) {
        try {
            act(() => root.unmount());
        } catch {
            // already unmounted
        }
    }
    for (const container of containers) {
        if (container.parentNode) container.remove();
    }
    containers = [];
    roots = [];
});

describe('useDismissOnOutsideOrEscape', () => {
    it('does not register listeners when active=false', () => {
        const onDismiss = vi.fn();
        mount(<Harness active={false} onDismiss={onDismiss} useRefForOutside />);

        const outside = document.querySelector('[data-testid="outside-area"]');
        expect(outside).toBeTruthy();
        if (outside) dispatchPointerDown(outside);
        dispatchEscape();

        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss when pointerdown is inside the ref', () => {
        const onDismiss = vi.fn();
        mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        const inside = document.querySelector('[data-testid="inside-button"]');
        expect(inside).toBeTruthy();
        if (inside) dispatchPointerDown(inside);

        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses on pointerdown outside the ref', () => {
        const onDismiss = vi.fn();
        mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        const outside = document.querySelector('[data-testid="outside-area"]');
        if (outside) dispatchPointerDown(outside);

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses on Escape', () => {
        const onDismiss = vi.fn();
        mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        dispatchEscape();

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('respects defaultPrevented on Escape (e.g. editor handler already consumed it)', () => {
        const onDismiss = vi.fn();
        mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        dispatchEscape(true);

        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('Escape-only mode (ref=null) dismisses on Escape but not on pointerdown', () => {
        const onDismiss = vi.fn();
        mount(<Harness active onDismiss={onDismiss} useRefForOutside={false} />);

        const outside = document.querySelector('[data-testid="outside-area"]');
        if (outside) dispatchPointerDown(outside);
        expect(onDismiss).not.toHaveBeenCalled();

        dispatchEscape();
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('removes listeners on cleanup', () => {
        const onDismiss = vi.fn();
        const { unmount } = mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        unmount();

        // After unmount the listeners should be detached. Dispatching events
        // must not invoke onDismiss any more.
        dispatchEscape();
        const outside = document.body;
        dispatchPointerDown(outside);

        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('removes listeners when active flips to false', () => {
        const onDismiss = vi.fn();
        const { rerender } = mount(<Harness active onDismiss={onDismiss} useRefForOutside />);

        rerender(<Harness active={false} onDismiss={onDismiss} useRefForOutside />);

        dispatchEscape();
        const outside = document.querySelector('[data-testid="outside-area"]');
        if (outside) dispatchPointerDown(outside);

        expect(onDismiss).not.toHaveBeenCalled();
    });
});
