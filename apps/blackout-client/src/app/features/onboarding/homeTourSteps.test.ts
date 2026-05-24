import { describe, expect, it } from 'vitest';
import { HOME_TOUR_STEPS } from './homeTourSteps';

describe('HOME_TOUR_STEPS', () => {
    const byId = (id: string) => HOME_TOUR_STEPS.find((step) => step.id === id);

    it('spotlights the homepage quick-action cards', () => {
        const step = byId('quick-actions');
        expect(step).toBeDefined();
        expect(step?.targetTestId).toBe('home-quick-actions');
    });

    it('spotlights the Discover feed section', () => {
        const step = byId('discover-feed');
        expect(step).toBeDefined();
        expect(step?.targetTestId).toBe('home-discover-list');
    });

    it('spotlights the bug-report widget', () => {
        const step = byId('bug-reporting');
        expect(step).toBeDefined();
        expect(step?.targetTestId).toBe('bug-report-fab');
    });

    it('keeps unique ids and non-empty copy for every step', () => {
        const ids = HOME_TOUR_STEPS.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const step of HOME_TOUR_STEPS) {
            expect(step.title.trim().length).toBeGreaterThan(0);
            expect(step.body.trim().length).toBeGreaterThan(0);
        }
    });
});
