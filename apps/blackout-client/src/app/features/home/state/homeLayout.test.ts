import { describe, it, expect } from 'vitest';
import { DEFAULT_HOME_WIDGET_ORDER } from '../homeWidgets';
import {
    DEFAULT_HOME_LAYOUT,
    addWidget,
    moveWidget,
    reconcileHomeLayout,
    removeWidget,
    reorderWidget,
    setWidgetHidden,
    type HomeLayoutState,
} from './homeLayout';

const base = (): HomeLayoutState => ({
    version: 1,
    order: [...DEFAULT_HOME_WIDGET_ORDER],
    hidden: [],
});

describe('reconcileHomeLayout', () => {
    it('returns the default layout for empty/undefined input', () => {
        expect(reconcileHomeLayout(undefined).order).toEqual(DEFAULT_HOME_WIDGET_ORDER);
        expect(reconcileHomeLayout(null).order).toEqual(DEFAULT_HOME_WIDGET_ORDER);
    });

    it('drops unknown ids and dedupes while preserving user order', () => {
        const result = reconcileHomeLayout({
            version: 1,
            order: ['feed', 'bogus', 'feed', 'quickActions'] as never,
            hidden: [],
        });
        expect(result.order[0]).toBe('feed');
        expect(result.order).not.toContain('bogus');
        expect(result.order.filter((id) => id === 'feed')).toHaveLength(1);
    });

    it('appends a default widget the stored layout never had (new-widget rollout)', () => {
        const result = reconcileHomeLayout({ version: 1, order: ['feed'], hidden: [] });
        // Every default widget must be present, feed kept first.
        expect(result.order[0]).toBe('feed');
        for (const id of DEFAULT_HOME_WIDGET_ORDER) expect(result.order).toContain(id);
    });

    it('clamps hidden to ids actually present in order', () => {
        const result = reconcileHomeLayout({
            version: 1,
            order: ['feed'],
            hidden: ['premiumPrivacyPulse'] as never,
        });
        expect(result.hidden).toEqual([]);
    });
});

describe('layout reducers', () => {
    it('moveWidget swaps neighbors and is a no-op at the edges', () => {
        const s = base();
        const first = s.order[0]!;
        expect(moveWidget(s, first, -1)).toEqual(s); // already at top
        const moved = moveWidget(s, first, 1);
        expect(moved.order[1]).toBe(first);
    });

    it('setWidgetHidden toggles membership', () => {
        const s = base();
        const hidden = setWidgetHidden(s, 'feed', true);
        expect(hidden.hidden).toContain('feed');
        expect(setWidgetHidden(hidden, 'feed', false).hidden).not.toContain('feed');
    });

    it('addWidget appends a premium widget and unhides an already-placed one', () => {
        const s = base();
        const added = addWidget(s, 'premiumPrivacyPulse');
        expect(added.order).toContain('premiumPrivacyPulse');
        const hiddenThenAdded = addWidget(setWidgetHidden(added, 'feed', true), 'feed');
        expect(hiddenThenAdded.hidden).not.toContain('feed');
    });

    it('removeWidget drops from both order and hidden', () => {
        const s = setWidgetHidden(
            addWidget(base(), 'premiumPrivacyPulse'),
            'premiumPrivacyPulse',
            true
        );
        const removed = removeWidget(s, 'premiumPrivacyPulse');
        expect(removed.order).not.toContain('premiumPrivacyPulse');
        expect(removed.hidden).not.toContain('premiumPrivacyPulse');
    });

    it('reorderWidget moves an id to sit before a target', () => {
        const s = base();
        const last = s.order[s.order.length - 1]!;
        const target = s.order[1]!;
        const result = reorderWidget(s, last, target);
        expect(result.order.indexOf(last)).toBe(result.order.indexOf(target) - 1);
        expect(result.order).toHaveLength(s.order.length);
    });
});

describe('DEFAULT_HOME_LAYOUT', () => {
    it('matches the registry default order and hides nothing', () => {
        expect(DEFAULT_HOME_LAYOUT.order).toEqual(DEFAULT_HOME_WIDGET_ORDER);
        expect(DEFAULT_HOME_LAYOUT.hidden).toEqual([]);
    });
});
