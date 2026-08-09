// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ONBOARDING_ANALYTICS_PATH, ONBOARDING_CREATOR_PATH, ONBOARDING_PATH } from './paths';

/**
 * `/onboarding/creator` also matches `/onboarding/:spaceIdOrAlias`, and
 * `/onboarding/:spaceIdOrAlias/analytics/` sits under the same prefix. Nothing
 * makes those disjoint — they resolve correctly only because React Router
 * ranks static segments above dynamic ones.
 *
 * That is an assumption about the router, not about our code, so it is worth a
 * test: a router upgrade or a change to nested/splat forms could flip it
 * silently and send creators into the canopy wizard instead.
 *
 * The route order here deliberately mirrors `main.tsx`, where `ONBOARDING_PATH`
 * is listed directly in `destinationRoutes` and the creator route is spread in
 * afterwards via `registryRoutes` — i.e. the dynamic route is registered first.
 */
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const renderAt = async (initialEntry: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter(
        [
            { path: ONBOARDING_PATH, element: <div data-testid="canopy-wizard" /> },
            { path: ONBOARDING_ANALYTICS_PATH, element: <div data-testid="analytics" /> },
            { path: ONBOARDING_CREATOR_PATH, element: <div data-testid="creator-wizard" /> },
        ],
        { initialEntries: [initialEntry] }
    );
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return container;
};

const matched = (container: HTMLElement): string | null => {
    for (const id of ['creator-wizard', 'analytics', 'canopy-wizard']) {
        if (container.querySelector(`[data-testid="${id}"]`)) return id;
    }
    return null;
};

describe('/onboarding/* route overlap', () => {
    it('sends /onboarding/creator to the creator wizard, not the canopy wizard', async () => {
        const container = await renderAt(ONBOARDING_CREATOR_PATH);
        expect(matched(container)).toBe('creator-wizard');
    });

    it('still sends a real space id to the canopy wizard', async () => {
        const container = await renderAt('/onboarding/!canopy:srv/');
        expect(matched(container)).toBe('canopy-wizard');
    });

    it('sends the analytics sub-path to the analytics page', async () => {
        const container = await renderAt('/onboarding/!canopy:srv/analytics/');
        expect(matched(container)).toBe('analytics');
    });

    it('documents the trailing-slash asymmetry between the two constants', () => {
        // ONBOARDING_PATH ends in a slash and the creator fork does not, which
        // is why a canopy literally named "creator" is unreachable. Asserted so
        // that normalising one without the other is a deliberate choice.
        expect(ONBOARDING_PATH.endsWith('/')).toBe(true);
        expect(ONBOARDING_CREATOR_PATH.endsWith('/')).toBe(false);
    });
});
