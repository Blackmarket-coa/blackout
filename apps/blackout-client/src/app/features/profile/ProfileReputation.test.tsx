// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ReputationProfile } from '@blackout/core';
import ProfileReputation from './ProfileReputation';

let container: HTMLDivElement | null = null;
let root: ReactDOM.Root | null = null;

function render(ui: React.ReactElement) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
        root!.render(ui);
    });
    return container;
}

beforeEach(() => {
    if (root) {
        act(() => root!.unmount());
    }
    container?.remove();
    container = null;
    root = null;
});

describe('ProfileReputation', () => {
    it('renders the subject breakdown sorted by score', () => {
        const reputation: ReputationProfile = {
            overall: { score: 14, tier: 'member' },
            bySubject: {
                tech: { score: 4, tier: 'member' },
                politics: { score: 10, tier: 'member' },
            },
        };
        const el = render(<ProfileReputation userId="@u:server" reputation={reputation} />);
        const panel = el.querySelector('[data-testid="profile-reputation"]');
        expect(panel).not.toBeNull();
        const chips = Array.from(panel!.querySelectorAll('[data-subject]'));
        expect(chips.map((c) => c.getAttribute('data-subject'))).toEqual(['politics', 'tech']);
        expect(panel!.textContent).toContain('Tech');
        expect(panel!.textContent).toContain('Politics');
    });

    it('shows an empty state when no reputation is earned', () => {
        const reputation: ReputationProfile = {
            overall: { score: 0, tier: 'member' },
            bySubject: {},
        };
        const el = render(<ProfileReputation userId="@u:server" reputation={reputation} />);
        expect(el.querySelector('[data-testid="profile-reputation"]')).toBeNull();
        expect(el.textContent).toContain('No reputation earned yet.');
    });
});
