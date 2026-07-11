// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMemberSince } from '../../../../src/app/features/profile/profileDisplay';
import { MiniProfile } from '../../../../src/app/features/profile/MiniProfile';
import type { MemberProfile } from '../../../../src/app/features/profile/profileTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('formatMemberSince', () => {
    it('renders month + year for a valid ISO timestamp', () => {
        // Mid-month noon UTC so no timezone puts it on a different month.
        const label = formatMemberSince('2026-03-15T12:00:00.000Z');
        expect(label).toContain('2026');
        expect(label).toMatch(/March|Mar/);
    });

    it('returns null for absent or invalid values', () => {
        expect(formatMemberSince(undefined)).toBeNull();
        expect(formatMemberSince('')).toBeNull();
        expect(formatMemberSince('not-a-date')).toBeNull();
    });
});

describe('MiniProfile member-since row', () => {
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

    const makeProfile = (overrides: Partial<MemberProfile> = {}): MemberProfile => ({
        userId: '@alice:example.org',
        displayName: 'Alice',
        roleBadges: [],
        mutualSpaces: [],
        profile: {},
        ...overrides,
    });

    it('shows "Member since" when the server stamped a date', () => {
        act(() => {
            root.render(
                <MiniProfile profile={makeProfile({ memberSince: '2026-03-15T12:00:00.000Z' })} />
            );
        });
        const row = container.querySelector('[data-testid="mini-profile-member-since"]');
        expect(row).not.toBeNull();
        expect(row?.textContent).toContain('Member since');
        expect(row?.textContent).toContain('2026');
    });

    it('omits the row entirely for profiles without a stamp', () => {
        act(() => {
            root.render(<MiniProfile profile={makeProfile()} />);
        });
        expect(container.querySelector('[data-testid="mini-profile-member-since"]')).toBeNull();
    });
});
