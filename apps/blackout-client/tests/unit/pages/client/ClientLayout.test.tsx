// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ScreenSize, ScreenSizeProvider } from '../../../../src/app/hooks/useScreenSize';
import ClientLayout from '../../../../src/app/pages/client/ClientLayout';
import { shellLayoutPlugin } from '../../../../src/app/plugins/shell/shellLayoutPlugin';

vi.mock('../../../../src/app/features/navigation/QuickSwitcher', () => ({
    QuickSwitcher: ({
        open,
    }: {
        open: boolean;
        onClose: () => void;
        onCommandPicked?: (command: string) => void;
        onActionPicked?: (actionId: 'mark-read' | 'open-inbox' | 'jump-mentions') => void;
    }) => <div data-testid="overlay-quick-switcher">{open ? 'open' : 'closed'}</div>,
}));

vi.mock('../../../../src/app/features/navigation/GlobalMentionsInbox', () => ({
    default: () => <div data-testid="overlay-global-inbox">inbox</div>,
}));

vi.mock('../../../../src/app/features/navigation/useInboxModel', () => ({
    useInboxModel: () => ({
        items: [],
        markReadLocal: vi.fn(),
        markAllRead: vi.fn(async () => undefined),
    }),
}));

vi.mock('../../../../src/app/features/quick-actions/featureEntrypoints', () => ({
    buildFeatureEntrypointRegistry: () => ({
        entries: [],
        entitlementLayers: {},
    }),
    getUnseenQuickActionIds: () => [],
    invokeQuickAction: vi.fn(),
    markQuickActionsSeen: vi.fn(),
}));

vi.mock('../../../../src/app/state/bmc-navigation', () => ({
    selectedRoomIdAtom: Symbol('selectedRoomIdAtom'),
    rightPanelAtom: Symbol('rightPanelAtom'),
}));

vi.mock('../../../../src/app/features/settings/settingsAtoms', () => ({
    settingsPageAtom: Symbol('settingsPageAtom'),
}));

vi.mock('../../../../src/app/state/bmc-composer', () => ({
    composerCommandPayloadAtom: Symbol('composerCommandPayloadAtom'),
    composerCommandStatusAtom: Symbol('composerCommandStatusAtom'),
}));

vi.mock('jotai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('jotai')>();
    return {
        ...actual,
        useAtom: () => [null, vi.fn()],
        useSetAtom: () => vi.fn(),
    };
});

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const renderClientLayout = (screenSize: ScreenSize) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    act(() => {
        root.render(
            <ScreenSizeProvider value={screenSize}>
                <ClientLayout nav={<aside data-testid="client-nav">Nav</aside>}>
                    <main data-testid="client-body">Body</main>
                </ClientLayout>
            </ScreenSizeProvider>
        );
    });

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

    it('uses shell layout plugin boundary when legacy shell plugin is enabled', () => {
        const isEnabledSpy = vi
            .spyOn(shellLayoutPlugin, 'hasLegacyFallbackEnabled')
            .mockReturnValue(true);
        const renderSpy = vi
            .spyOn(shellLayoutPlugin, 'renderLegacyFallbackLayout')
            .mockImplementation(() => <div data-testid="plugin-shell-layout">Legacy Shell</div>);

        const container = renderClientLayout(ScreenSize.Desktop);

        expect(container.querySelector('[data-testid="plugin-shell-layout"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="client-shell-separator"]')).toBeNull();

        isEnabledSpy.mockRestore();
        renderSpy.mockRestore();
    });

    it('opens quick switcher overlay when pressing Ctrl+K', () => {
        const container = renderClientLayout(ScreenSize.Desktop);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
        });

        expect(container.querySelector('[data-testid="overlay-quick-switcher"]')?.textContent).toBe(
            'open',
        );
    });

    it('opens quick switcher overlay when pressing Cmd+K', () => {
        const container = renderClientLayout(ScreenSize.Desktop);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });

        expect(container.querySelector('[data-testid="overlay-quick-switcher"]')?.textContent).toBe(
            'open',
        );
    });
});
