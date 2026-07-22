// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { BackRouteHandler } from '../../../src/app/components/BackRouteHandler';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location" data-pathname={location.pathname} />;
};

const mountedRoots: ReactDOM.Root[] = [];

const renderAt = (path: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <BackRouteHandler>
                    {(onBack) => (
                        <button type="button" data-testid="back" onClick={onBack}>
                            Back
                        </button>
                    )}
                </BackRouteHandler>
                <LocationProbe />
            </MemoryRouter>
        );
    });
    mountedRoots.push(root);
    const goBack = () => {
        act(() => {
            (container.querySelector('[data-testid="back"]') as HTMLButtonElement).click();
        });
    };
    const pathname = () =>
        (container.querySelector('[data-testid="location"]') as HTMLDivElement).dataset.pathname;
    return { goBack, pathname };
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('BackRouteHandler', () => {
    it('goes from a den view up to its canopy', () => {
        const { goBack, pathname } = renderAt(
            `/communities/${encodeURIComponent('!canopy:server')}/dens/${encodeURIComponent(
                '!den:server'
            )}`
        );
        goBack();
        expect(pathname()).toBe(`/communities/${encodeURIComponent('!canopy:server')}`);
    });

    it('goes from a no-canopy den up to the communities directory', () => {
        const { goBack, pathname } = renderAt(
            `/communities/-/dens/${encodeURIComponent('!den:server')}`
        );
        goBack();
        expect(pathname()).toBe('/communities');
    });

    it('goes from a canopy view up to the communities directory', () => {
        const { goBack, pathname } = renderAt(
            `/communities/${encodeURIComponent('!canopy:server')}`
        );
        goBack();
        expect(pathname()).toBe('/communities');
    });

    it('goes home from any other surface (no greedy space match)', () => {
        const { goBack, pathname } = renderAt('/settings/preferences');
        goBack();
        expect(pathname()).toBe('/');
    });
});
