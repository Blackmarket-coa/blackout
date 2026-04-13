// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import ReactDOM from 'react-dom/client';
import { ScreenSize, ScreenSizeProvider } from '../../../../src/app/hooks/useScreenSize';
import ClientLayout from '../../../../src/app/pages/client/ClientLayout';

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
});

const renderClientLayout = (screenSize: ScreenSize) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    root.render(
        <ScreenSizeProvider value={screenSize}>
            <ClientLayout nav={<aside data-testid="client-nav">Nav</aside>}>
                <main data-testid="client-body">Body</main>
            </ClientLayout>
        </ScreenSizeProvider>
    );

    mountedRoots.push(root);
    return container;
};

describe('ClientLayout baseline parity', () => {
    it('renders nav and body with desktop shell split', () => {
        const container = renderClientLayout(ScreenSize.Desktop);

        expect(container.querySelector('[data-testid="client-nav"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="client-body"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="client-shell-separator"]')).toBeTruthy();
    });

    it('keeps nav and body while dropping desktop separator on mobile', () => {
        const container = renderClientLayout(ScreenSize.Mobile);

        expect(container.querySelector('[data-testid="client-nav"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="client-body"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="client-shell-separator"]')).toBeNull();
    });
});
