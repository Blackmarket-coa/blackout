import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_TOUR_STEPS } from './homeTourSteps';

// `apps/blackout-client/src/app/features/onboarding` → repo root.
const REPO_ROOT = resolve(__dirname, '../../../../../..');

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

    it('covers the canopy/den surfaces the product is now built around', () => {
        for (const id of ['canopy-rail', 'canopies-hub', 'create-hub', 'coalition-map']) {
            expect(byId(id), `missing tour step "${id}"`).toBeDefined();
        }
    });

    it('keeps unique ids and non-empty copy for every step', () => {
        const ids = HOME_TOUR_STEPS.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const step of HOME_TOUR_STEPS) {
            expect(step.title.trim().length).toBeGreaterThan(0);
            expect(step.body.trim().length).toBeGreaterThan(0);
        }
    });

    // These render verbatim as links and source paths in the tooltip, so a
    // rename elsewhere in the repo silently ships a 404 to new users. Two had
    // already rotted into `docs/archive/` before this test existed.
    it('only links docs that exist in the repo', () => {
        const missing = HOME_TOUR_STEPS.flatMap((step) =>
            step.docLinks
                .filter(({ href }) => !existsSync(resolve(REPO_ROOT, href.replace(/^\//, ''))))
                .map(({ href }) => `${step.id} → ${href}`)
        );
        expect(missing).toEqual([]);
    });

    it('only cites source files that exist in the repo', () => {
        const missing = HOME_TOUR_STEPS.flatMap((step) =>
            step.filePaths
                .filter((filePath) => !existsSync(resolve(REPO_ROOT, filePath)))
                .map((filePath) => `${step.id} → ${filePath}`)
        );
        expect(missing).toEqual([]);
    });
});
