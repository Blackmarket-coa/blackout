// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import AboutSettings from '../../../../src/app/features/settings/AboutSettings';

// Settings UX completion per DEPLOYMENT_READINESS_PLAN.md §4: the About
// page must surface build provenance (version, channel, build SHA) plus
// links the user can use to escalate. The interaction/visual contract is
// covered here at the DOM level rather than through Playwright because the
// page has no behavioral surface beyond rendering — a heavier E2E would
// not catch a regression any earlier.

let container: HTMLDivElement;
let root: ReactDOM.Root;

const renderAbout = () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<AboutSettings />);
    });
};

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
});

describe('AboutSettings', () => {
    it('renders the build provenance triple (version, channel, SHA)', () => {
        renderAbout();
        const text = container.textContent ?? '';
        expect(text).toMatch(/Version:/);
        expect(text).toMatch(/Build channel:/);
        expect(text).toMatch(/Build ID:/);
    });

    it('renders the support escalation links with external rel/target', () => {
        renderAbout();
        const anchors = Array.from(container.querySelectorAll('a'));
        expect(anchors.length).toBeGreaterThanOrEqual(3);
        // Every external link should open safely.
        for (const a of anchors) {
            expect(a.getAttribute('target')).toBe('_blank');
            expect(a.getAttribute('rel')).toContain('noreferrer');
            expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
        }
    });

    it('exposes the repo, issue tracker, and docs as labeled links', () => {
        renderAbout();
        const labels = Array.from(container.querySelectorAll('a')).map((a) => a.textContent?.trim());
        expect(labels).toEqual(expect.arrayContaining(['Repository', 'Issue Tracker', 'Documentation']));
    });
});
