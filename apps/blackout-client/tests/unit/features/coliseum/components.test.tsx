// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import {
    StanceBar,
    formatRelativeTime,
    displayNameFromUserId,
} from '../../../../src/app/features/coliseum/components';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const render = (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    mountedRoots.push(root);
    return container;
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('formatRelativeTime', () => {
    const now = Date.parse('2026-07-09T12:00:00Z');

    it('formats compact Twitter-style buckets', () => {
        expect(formatRelativeTime(now - 10_000, now)).toBe('now');
        expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m');
        expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h');
        expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d');
        expect(formatRelativeTime(now - 14 * 86_400_000, now)).toBe('2w');
    });

    it('never renders negative deltas for future timestamps', () => {
        expect(formatRelativeTime(now + 60_000, now)).toBe('now');
    });
});

describe('displayNameFromUserId', () => {
    it('extracts the Matrix localpart', () => {
        expect(displayNameFromUserId('@alice:example.org')).toBe('alice');
        expect(displayNameFromUserId('bob')).toBe('bob');
    });
});

describe('StanceBar', () => {
    it('renders proportional segments', () => {
        const container = render(
            <StanceBar
                items={[
                    { stance: 'for' },
                    { stance: 'for' },
                    { stance: 'against' },
                    { stance: 'nuance' },
                ]}
            />
        );
        const bar = container.querySelector('[data-testid="coliseum-stance-bar"]');
        expect(bar).toBeTruthy();
        const segments = bar?.querySelectorAll('span') ?? [];
        expect(segments.length).toBe(3);
        expect((segments[0] as HTMLElement).style.width).toBe('50%');
    });

    it('renders nothing without arguments', () => {
        const container = render(<StanceBar items={[]} />);
        expect(container.querySelector('[data-testid="coliseum-stance-bar"]')).toBeNull();
    });
});
