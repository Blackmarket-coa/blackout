// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '../../../src/app/hooks/useScreenSize';
import ClientLayout from '../../../src/app/pages/client/ClientLayout';
import { resolveRightPanelSlotRegistry } from '../../../src/app/plugins/right-panel';
import { shellLayoutPlugin } from '../../../src/app/plugins/shell/shellLayoutPlugin';

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const snapshotClientLayout = (screenSize: ScreenSize) => {
    vi.spyOn(shellLayoutPlugin, 'hasLegacyFallbackEnabled').mockReturnValue(false);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);

    flushSync(() => {
        root.render(
            <ScreenSizeProvider value={screenSize}>
                <ClientLayout nav={<aside data-testid="client-nav">Nav rail</aside>}>
                    <main data-testid="client-main">Content</main>
                </ClientLayout>
            </ScreenSizeProvider>
        );
    });

    return {
        navExists: Boolean(container.querySelector('[data-testid="client-nav"]')),
        mainExists: Boolean(container.querySelector('[data-testid="client-main"]')),
        separatorExists: Boolean(container.querySelector('[data-testid="client-shell-separator"]')),
        navBeforeMain:
            Boolean(container.querySelector('[data-testid="client-nav"]')) &&
            Boolean(container.querySelector('[data-testid="client-main"]')) &&
            ((container
                .querySelector('[data-testid="client-nav"]')
                ?.compareDocumentPosition(
                    container.querySelector('[data-testid="client-main"]') as Node
                ) ?? 0) &
                Node.DOCUMENT_POSITION_FOLLOWING) > 0,
    };
};

describe('monetization parity/layout matrix', () => {
    it('preserves ClientLayout shell separators across desktop/mobile', () => {
        expect({
            desktop: snapshotClientLayout(ScreenSize.Desktop),
            mobile: snapshotClientLayout(ScreenSize.Mobile),
        }).toMatchInlineSnapshot(`
          {
            "desktop": {
              "mainExists": true,
              "navBeforeMain": true,
              "navExists": true,
              "separatorExists": true,
            },
            "mobile": {
              "mainExists": true,
              "navBeforeMain": true,
              "navExists": true,
              "separatorExists": false,
            },
          }
        `);
    });

    it('keeps navigation/right-panel insertion points stable for monetization-enabled rails', () => {
        const baselineSlots = resolveRightPanelSlotRegistry(false, true);
        const pluginSlots = resolveRightPanelSlotRegistry(true, true);

        expect(Object.keys(baselineSlots)).toMatchInlineSnapshot(`
          [
            "members",
            "threads",
            "pins",
            "search",
            "governance",
            "monetization",
          ]
        `);
        expect(Object.keys(pluginSlots)).toMatchInlineSnapshot(`
          [
            "members",
            "threads",
            "pins",
            "search",
            "governance",
            "monetization",
            "roles",
          ]
        `);
    });
});
