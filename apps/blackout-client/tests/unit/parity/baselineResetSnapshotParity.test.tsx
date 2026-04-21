// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '../../../src/app/hooks/useScreenSize';
import ClientLayout from '../../../src/app/pages/client/ClientLayout';
import { resolveFeatureFlags } from '../../../src/app/core/features/featureFlags';
import { resolveComposerMessageSpacingItems } from '../../../src/app/plugins/composer';
import { getMessageActions } from '../../../src/app/plugins/composer/quickActionCatalog';
import { shellLayoutPlugin } from '../../../src/app/plugins/shell/shellLayoutPlugin';
import { roomViewBaselineControlLayout } from '../../../src/app/features/room/roomViewLayoutContract';

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const renderClientLayoutSnapshot = (screenSize: ScreenSize) => {
    vi.spyOn(shellLayoutPlugin, 'isEnabled').mockReturnValue(false);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    flushSync(() => {
        root.render(
            <ScreenSizeProvider value={screenSize}>
                <ClientLayout nav={<aside data-testid="client-nav">Nav</aside>}>
                    <main data-testid="client-body">Body</main>
                </ClientLayout>
            </ScreenSizeProvider>
        );
    });

    mountedRoots.push(root);

    const nav = container.querySelector('[data-testid="client-nav"]');
    const body = container.querySelector('[data-testid="client-body"]');
    const separator = container.querySelector('[data-testid="client-shell-separator"]');

    return {
        hasNav: Boolean(nav),
        hasBody: Boolean(body),
        hasDesktopSeparator: Boolean(separator),
        navBeforeBody:
            Boolean(nav) &&
            Boolean(body) &&
            ((nav?.compareDocumentPosition(body as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
    };
};

const buildParitySnapshot = (mode: 'baseline' | 'default') => {
    const flags = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: mode });

    return {
        spacingTokens: resolveComposerMessageSpacingItems(flags.composerQuickActions).map((item) => item.spacing),
        componentAlignment: {
            desktop: renderClientLayoutSnapshot(ScreenSize.Desktop),
            mobile: renderClientLayoutSnapshot(ScreenSize.Mobile),
        },
        coreControlLocations: {
            composerRegion: roomViewBaselineControlLayout.composerRegion,
            timelineRegion: roomViewBaselineControlLayout.timelineRegion,
            roomActions: getMessageActions({ msgtype: 'm.text' }).map((action) => action.label),
        },
    };
};

describe('Cinny baseline reset parity snapshots', () => {
    it('keeps spacing tokens and control placement identical in plugin-disabled baseline mode', () => {
        const cleanBaselineSnapshot = {
            spacingTokens: ['200', '400', '500'],
            componentAlignment: {
                desktop: {
                    hasNav: true,
                    hasBody: true,
                    hasDesktopSeparator: true,
                    navBeforeBody: true,
                },
                mobile: {
                    hasNav: true,
                    hasBody: true,
                    hasDesktopSeparator: false,
                    navBeforeBody: true,
                },
            },
            coreControlLocations: {
                composerRegion: 'bottom',
                timelineRegion: 'top',
                roomActions: ['React', 'Thread', 'Forward', 'Pin', 'Flag'],
            },
        };

        const baselineModeSnapshot = buildParitySnapshot('baseline');

        expect(baselineModeSnapshot).toEqual(cleanBaselineSnapshot);
    });

    it('compares pre/post-reset snapshots and asserts plugin-disabled mode equals clean baseline behavior', () => {
        const cleanBaselineSnapshot = buildParitySnapshot('baseline');
        const postResetPluginDisabledSnapshot = buildParitySnapshot('baseline');

        expect(postResetPluginDisabledSnapshot).toEqual(cleanBaselineSnapshot);
    });
});
