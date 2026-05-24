// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import StaggeredMount from './StaggeredMount';

const Child = ({ label }: { label: string }): JSX.Element => (
    <div data-testid="child" data-label={label} />
);

const labels = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-testid="child"]')).map(
        (node) => node.getAttribute('data-label') ?? '',
    );

describe('StaggeredMount', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    it('mounts the first child immediately and the rest on a stagger', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        act(() => {
            root.render(
                <StaggeredMount delayMs={200}>
                    <Child label="a" />
                    <Child label="b" />
                    <Child label="c" />
                </StaggeredMount>,
            );
        });

        // Only the first child fetches/mounts in the initial tick; the rest are
        // still placeholders so a tab open doesn't burst concurrent requests.
        expect(labels(container)).toEqual(['a']);
        expect(
            container.querySelectorAll('[data-testid="staggered-placeholder"]').length,
        ).toBe(2);

        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(labels(container)).toEqual(['a', 'b']);

        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(labels(container)).toEqual(['a', 'b', 'c']);
        expect(
            container.querySelectorAll('[data-testid="staggered-placeholder"]').length,
        ).toBe(0);

        act(() => {
            root.unmount();
        });
        vi.useRealTimers();
    });

    it('clears pending timers on unmount', () => {
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        act(() => {
            root.render(
                <StaggeredMount delayMs={200}>
                    <Child label="a" />
                    <Child label="b" />
                </StaggeredMount>,
            );
        });

        act(() => {
            root.unmount();
        });

        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
        vi.useRealTimers();
    });
});
