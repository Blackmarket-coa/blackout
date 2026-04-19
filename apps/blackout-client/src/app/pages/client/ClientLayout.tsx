import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useSetAtom } from 'jotai';
import { Box, Line } from 'folds';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuickSwitcher as NavigationQuickSwitcher } from '../../features/navigation/QuickSwitcher';
import GlobalMentionsInbox from '../../features/navigation/GlobalMentionsInbox';
import { useInboxModel } from '../../features/navigation/useInboxModel';
import {
    buildFeatureEntrypointRegistry,
    getUnseenQuickActionIds,
    invokeQuickAction,
    markQuickActionsSeen,
    type QuickActionId,
} from '../../features/quick-actions/featureEntrypoints';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { shellLayoutPlugin } from '../../plugins/shell/shellLayoutPlugin';
import { composerCommandPayloadAtom, composerCommandStatusAtom } from '../../state/bmc-composer';
import { rightPanelAtom, selectedRoomIdAtom } from '../../state/bmc-navigation';
import { settingsPageAtom } from '../../features/settings/settingsAtoms';
import { rightPanelPlugin } from '../../plugins/right-panel';
import { LegacyOverlayHost, openLegacyOverlaySearch } from './LegacyOverlayHost';

type ClientLayoutProps = {
    nav?: ReactNode;
    children?: ReactNode;
};

export function ClientLayout({ nav, children }: ClientLayoutProps) {
    const screenSize = useScreenSizeContext();
    const [quickOpen, setQuickOpen] = useState(false);
    const [inboxOpen, setInboxOpen] = useState(false);
    const [, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
    const [, setRightPanel] = useAtom(rightPanelAtom);
    const setSettingsPage = useSetAtom(settingsPageAtom);
    const navigate = useNavigate();
    const location = useLocation();
    const setComposerCommandPayload = useSetAtom(composerCommandPayloadAtom);
    const setComposerCommandStatus = useSetAtom(composerCommandStatusAtom);
    const { items: mentionItems, markReadLocal, markAllRead } = useInboxModel();
    const quickActionRegistry = useMemo(() => buildFeatureEntrypointRegistry(), []);

    if (shellLayoutPlugin.hasLegacyFallbackEnabled()) {
        return shellLayoutPlugin.renderLegacyFallbackLayout();
    }

    useEffect(() => {
        const handler = (event: globalThis.KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setQuickOpen(true);
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        const unseenQuickActionIds = getUnseenQuickActionIds(quickActionRegistry.entries);
        if (unseenQuickActionIds.length === 0) return;
        markQuickActionsSeen(unseenQuickActionIds);
    }, [quickActionRegistry.entries]);

    const queueCommandForComposer = useCallback(
        (command: string) => {
            setComposerCommandPayload({
                nonce: Date.now(),
                roomId: null,
                text: command,
            });
            setComposerCommandStatus(`Ready to send ${command}.`);
        },
        [setComposerCommandPayload, setComposerCommandStatus]
    );

    const handleQuickAction = useCallback(
        (actionId: QuickActionId) => {
            invokeQuickAction(actionId, {
                openSettings: () => {
                    setSettingsPage('appearance');
                    void navigate({
                        pathname: location.pathname,
                        search: openLegacyOverlaySearch(location.search, 'settings'),
                    });
                },
                openDevices: () => {
                    setSettingsPage('voice-video');
                    void navigate({
                        pathname: location.pathname,
                        search: openLegacyOverlaySearch(location.search, 'settings'),
                    });
                },
                toggleInbox: () => setInboxOpen((prev) => !prev),
                openThreads: () => setRightPanel('threads'),
                openSearch: () => setRightPanel('search'),
                openWidgetPanel: (widgetId) => {
                    if (!rightPanelPlugin.isEnabled()) return;
                    setRightPanel(widgetId);
                },
                queueCommand: queueCommandForComposer,
            });
        },
        [
            location.pathname,
            location.search,
            navigate,
            queueCommandForComposer,
            setRightPanel,
            setSettingsPage,
        ]
    );

    return (
        <Box grow="Yes">
            {nav}
            {screenSize !== ScreenSize.Mobile && (
                <Line
                    data-testid="client-shell-separator"
                    variant="Background"
                    direction="Vertical"
                    size="300"
                />
            )}
            {children}
            <NavigationQuickSwitcher
                open={quickOpen}
                onClose={() => setQuickOpen(false)}
                onCommandPicked={queueCommandForComposer}
                onActionPicked={(actionId) => {
                    if (actionId === 'mark-read') {
                        void markAllRead();
                        return;
                    }
                    if (actionId === 'open-inbox') {
                        handleQuickAction('open-inbox');
                        return;
                    }
                    if (actionId === 'jump-mentions') {
                        setSelectedRoomId(null);
                        setInboxOpen(true);
                    }
                }}
            />
            {inboxOpen ? (
                <GlobalMentionsInbox
                    items={mentionItems}
                    onClose={() => setInboxOpen(false)}
                    onMarkAllRead={markAllRead}
                    onMarkReadLocal={markReadLocal}
                />
            ) : null}
            <LegacyOverlayHost />
        </Box>
    );
}

export default ClientLayout;
