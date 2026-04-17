import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { Link, useInRouterContext, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';
import { joinedRoomsAtom } from '../../state/bmc-rooms';
import { userIdAtom } from '../../state/bmc-auth';
import {
    selectedRoomIdAtom,
    selectedSpaceIdAtom,
    rightPanelAtom,
    roomJumpTargetEventIdAtom,
    roomUnreadMarkerEventIdAtom,
    type RightPanelType,
} from '../../state/bmc-navigation';
import { settingsAtom } from '../../state/bmc-settings';
import { composerCommandPayloadAtom, composerCommandStatusAtom } from '../../state/bmc-composer';
import {
    DeadDropComposer,
    DeadDropIndicator,
    DeadDropSettings,
    useDeadDrop,
} from '../../features/deaddrop';
import MessageComposer from '../../features/room/MessageComposer';
import RoomTimeline from '../../features/room/RoomTimeline';
import ForumView from '../../features/forum/ForumView';
import { QuickSwitcher as NavigationQuickSwitcher } from '../../features/navigation/QuickSwitcher';
import { useMentionNavigation } from '../../features/navigation/useMentionNavigation';
import GlobalMentionsInbox from '../../features/navigation/GlobalMentionsInbox';
import { useInboxModel } from '../../features/navigation/useInboxModel';
import { SettingsPage } from '../../features/settings';
import { VoiceStrip, useOptionalCall } from '../../features/call';
import { OnboardingWizard, WelcomeScreen } from '../../features/welcome';
import { useRoomTimeline } from '../../hooks/bmc-useTimeline';
import { useRoom } from '../../hooks/bmc-useRoom';
import RightPanelContent from '../../features/right-panel/RightPanelContent';
import { buildSpaceGroups } from '../../features/right-panel/rightPanelUtils';
import { rightPanelPlugin } from '../../plugins/right-panel';
import { WIDGET_PANEL_INVENTORY_IDS } from '../../plugins/right-panel/panelSlots';
import { settingsPageAtom } from '../../features/settings/settingsAtoms';
import { hasModeratorAccess } from '../../features/moderation/draupnir';
import {
    buildFeatureEntrypointRegistry,
    getQuickActionEntriesForSurface,
    getUnseenQuickActionIds,
    invokeQuickAction,
    markQuickActionsSeen,
    type QuickActionId,
    readQuickActionCollapsed,
    writeQuickActionCollapsed,
} from '../../features/quick-actions/featureEntrypoints';
import { resolveCapabilityAccessMap } from '../../resolver/capabilityAccessResolver';
import { designShellLayout, designSpacing } from '../../../../../../packages/design/src';
import { isMobileViewport, isTabletViewport } from './layoutMetrics';

const BASE_RIGHT_PANELS: Exclude<RightPanelType, null>[] = [
    'members',
    'threads',
    'pins',
    'search',
    'governance',
    'monetization',
];

const roomKindIcon = (room: Room): string => {
    const type = room.getType?.() ?? '';
    if (type === 'm.space') return '🗂️';
    if (room.getCanonicalAlias()?.includes('voice')) return '🔊';
    if (room.getCanonicalAlias()?.includes('forum')) return '💬';
    if (room.getCanonicalAlias()?.includes('announce')) return '📢';
    return '💭';
};

const roomUnread = (room: Room): number => room.getUnreadNotificationCount() || 0;

export const ClientLayout = () => {
    const client = useMatrixClient();
    const rooms = useAtomValue(joinedRoomsAtom);
    const userId = useAtomValue(userIdAtom);
    const [settings, setSettings] = useAtom(settingsAtom);
    const [, setSettingsPage] = useAtom(settingsPageAtom);
    const [selectedRoomId, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
    const [selectedSpaceId, setSelectedSpaceId] = useAtom(selectedSpaceIdAtom);
    const [rightPanel, setRightPanel] = useAtom(rightPanelAtom);
    const [jumpTargetEventId, setJumpTargetEventId] = useAtom(roomJumpTargetEventIdAtom);
    const [unreadMarkerEventId, setUnreadMarkerEventId] = useAtom(roomUnreadMarkerEventIdAtom);
    const [, setComposerCommandPayload] = useAtom(composerCommandPayloadAtom);
    const [composerCommandStatus, setComposerCommandStatus] = useAtom(composerCommandStatusAtom);
    const { openRoomWithContext } = useMentionNavigation();

    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
    const [quickOpen, setQuickOpen] = useState(false);
    const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(() =>
        readQuickActionCollapsed()
    );
    const [inboxOpen, setInboxOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [roomSurface, setRoomSurface] = useState<'timeline' | 'forum'>('timeline');
    const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
    const [spaceOrder, setSpaceOrder] = useState<string[]>([]);
    const previousRoomIdRef = useRef<string | null>(null);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');
    const callState = useOptionalCall();
    const { items: mentionItems, markReadLocal, markAllRead } = useInboxModel();
    const inRouterContext = useInRouterContext();
    const location = useLocation();
    const navigate = useNavigate();
    const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
    const hasHydratedNavigationRef = useRef(false);

    const layout = settings.layout ?? {
        spaceColumnWidth: designShellLayout.defaultSpaceColumnWidthPx,
        roomColumnWidth: designShellLayout.defaultRoomColumnWidthPx,
    };
    const spaces = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);
    const homeRooms = useMemo(() => rooms.filter((room) => room.getType() !== 'm.space'), [rooms]);
    const featureEntrypointRegistry = useMemo(() => buildFeatureEntrypointRegistry(), []);
    const capabilityAccess = useMemo(
        () =>
            resolveCapabilityAccessMap(
                ['features.bmc.roles', 'features.call.elementCall', 'features.bmc.forum'],
                featureEntrypointRegistry.entitlementLayers
            ),
        [featureEntrypointRegistry.entitlementLayers]
    );
    const rolesEnabled = capabilityAccess['features.bmc.roles'] ?? false;
    const rightPanelPluginEnabled = rightPanelPlugin.isEnabled();
    const rolesPanelEnabled = rolesEnabled && rightPanelPluginEnabled;
    const widgetPackEnabled = rightPanelPluginEnabled;
    const callEnabled = capabilityAccess['features.call.elementCall'] ?? false;
    const forumEnabled = capabilityAccess['features.bmc.forum'] ?? false;
    const activeSpeakingCount = useMemo(
        () =>
            callState
                ? Object.values(callState.audioLevels).filter((level) => level.speaking).length
                : 0,
        [callState]
    );
    const rightPanels = useMemo(
        () => [
            ...BASE_RIGHT_PANELS,
            ...(rolesPanelEnabled ? (['roles'] as const) : []),
            ...(widgetPackEnabled ? WIDGET_PANEL_INVENTORY_IDS : []),
        ],
        [rolesPanelEnabled, widgetPackEnabled]
    );

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

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
        if (spaceOrder.length > 0) return;
        setSpaceOrder(spaces.map((room) => room.roomId));
    }, [spaceOrder.length, spaces]);

    useEffect(() => {
        const key = `blackout.collapsed.${selectedSpaceId ?? 'home'}`;
        const raw = window.localStorage.getItem(key);
        setCollapsedFolders(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    }, [selectedSpaceId]);

    useEffect(() => {
        const key = `blackout.collapsed.${selectedSpaceId ?? 'home'}`;
        window.localStorage.setItem(key, JSON.stringify(collapsedFolders));
    }, [collapsedFolders, selectedSpaceId]);

    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const loadDevices = async () => {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audio = devices.filter((device) => device.kind === 'audioinput');
            const video = devices.filter((device) => device.kind === 'videoinput');
            setAudioDevices(audio);
            setVideoDevices(video);
            if (!selectedAudioDeviceId && audio[0]) setSelectedAudioDeviceId(audio[0].deviceId);
            if (!selectedVideoDeviceId && video[0]) setSelectedVideoDeviceId(video[0].deviceId);
        };

        void loadDevices();
        navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);
        return () => navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices);
    }, [selectedAudioDeviceId, selectedVideoDeviceId]);

    useEffect(() => {
        if (settings.preferredAudioDeviceId) {
            setSelectedAudioDeviceId(settings.preferredAudioDeviceId);
            callState?.setPreferredAudioDeviceId(settings.preferredAudioDeviceId);
        }
        if (settings.preferredVideoDeviceId) {
            setSelectedVideoDeviceId(settings.preferredVideoDeviceId);
            callState?.setPreferredVideoDeviceId(settings.preferredVideoDeviceId);
        }
    }, [callState, settings.preferredAudioDeviceId, settings.preferredVideoDeviceId]);

    useEffect(() => {
        if (previousRoomIdRef.current && previousRoomIdRef.current !== selectedRoomId) {
            setRightPanel(null);
            setRoomSurface('timeline');
        }
        previousRoomIdRef.current = selectedRoomId;
    }, [selectedRoomId, setRightPanel]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nextSpaceId = params.get('space');
        const nextPanelParam = params.get('panel');
        const nextJumpTargetEventId = params.get('event');
        const nextRightPanel = rightPanels.includes(nextPanelParam as Exclude<RightPanelType, null>)
            ? (nextPanelParam as RightPanelType)
            : null;
        const hasUrlNavigationState = Boolean(
            routeRoomId || nextSpaceId || nextPanelParam || nextJumpTargetEventId
        );

        if (!hasUrlNavigationState && !hasHydratedNavigationRef.current) {
            hasHydratedNavigationRef.current = true;
            return;
        }

        setSelectedRoomId(routeRoomId ?? null);
        setSelectedSpaceId(nextSpaceId);
        setRightPanel(nextRightPanel);
        setJumpTargetEventId(nextJumpTargetEventId);
        hasHydratedNavigationRef.current = true;
    }, [
        location.search,
        rightPanels,
        routeRoomId,
        setJumpTargetEventId,
        setRightPanel,
        setSelectedRoomId,
        setSelectedSpaceId,
    ]);

    useEffect(() => {
        if (!hasHydratedNavigationRef.current) return;

        const pathname = selectedRoomId ? `/room/${encodeURIComponent(selectedRoomId)}` : '/';
        const params = new URLSearchParams();

        if (selectedSpaceId) params.set('space', selectedSpaceId);
        if (rightPanel) params.set('panel', rightPanel);
        if (jumpTargetEventId) params.set('event', jumpTargetEventId);

        const search = params.toString();
        const nextUrl = `${pathname}${search ? `?${search}` : ''}`;
        const currentUrl = `${location.pathname}${location.search}`;
        if (nextUrl === currentUrl) return;

        void navigate({ pathname, search: search ? `?${search}` : '' });
    }, [
        jumpTargetEventId,
        location.pathname,
        location.search,
        navigate,
        rightPanel,
        selectedRoomId,
        selectedSpaceId,
    ]);

    const orderedSpaces = useMemo(
        () =>
            [...spaces].sort((a, b) => spaceOrder.indexOf(a.roomId) - spaceOrder.indexOf(b.roomId)),
        [spaceOrder, spaces]
    );

    const onboardingSpaceId = useMemo(() => {
        if (selectedSpaceId) return selectedSpaceId;
        if (orderedSpaces[0]?.roomId) return orderedSpaces[0].roomId;
        return 'home';
    }, [orderedSpaces, selectedSpaceId]);
    const [suppressedOnboardingBySpace, setSuppressedOnboardingBySpace] = useState<
        Record<string, boolean>
    >({});
    const onboardingSuppressed = suppressedOnboardingBySpace[onboardingSpaceId] === true;

    useEffect(() => {
        setSuppressedOnboardingBySpace((prev) => {
            if (Object.keys(prev).length === 0) return prev;
            return { ...prev, [onboardingSpaceId]: false };
        });
    }, [onboardingSpaceId]);

    const selectedSpaceRooms = useMemo(() => {
        if (settings.mobileRoomListScope === 'all' || !selectedSpaceId) return homeRooms;
        return homeRooms.filter(
            (room) =>
                room.roomId.includes(selectedSpaceId.slice(1, 5)) ||
                room.name.toLowerCase().includes(selectedSpaceId.slice(1, 4).toLowerCase())
        );
    }, [homeRooms, selectedSpaceId, settings.mobileRoomListScope]);

    const deadDrop = useDeadDrop(selectedRoomId ?? '');
    const activeRoomState = useRoom(selectedRoomId ?? '');
    const timelineState = useRoomTimeline(selectedRoomId ?? '');
    const myPresence = userId ? client.getUser(userId)?.presence ?? 'offline' : 'offline';

    const groups = useMemo(
        () => buildSpaceGroups({ selectedSpaceId, selectedSpaceRooms, rooms }),
        [rooms, selectedSpaceId, selectedSpaceRooms]
    );

    const canOpenModerationDashboard = useMemo(
        () => hasModeratorAccess(rooms, userId),
        [rooms, userId]
    );
    const desktopQuickActions = useMemo(
        () => getQuickActionEntriesForSurface(featureEntrypointRegistry, 'desktop'),
        [featureEntrypointRegistry]
    );
    const mobileQuickActions = useMemo(
        () => getQuickActionEntriesForSurface(featureEntrypointRegistry, 'mobile'),
        [featureEntrypointRegistry]
    );
    const unseenQuickActionIds = useMemo(
        () => getUnseenQuickActionIds(featureEntrypointRegistry.entries),
        [featureEntrypointRegistry.entries]
    );

    useEffect(() => {
        writeQuickActionCollapsed(quickActionsCollapsed);
    }, [quickActionsCollapsed]);

    useEffect(() => {
        if (unseenQuickActionIds.length === 0) return;
        markQuickActionsSeen(unseenQuickActionIds);
    }, [unseenQuickActionIds]);

    const persistSpaceOrder = async (next: string[]) => {
        setSpaceOrder(next);
        await client.setAccountData('blackout.space_order' as never, { order: next } as never);
    };

    const openRoom = (roomId: string, jumpToEventId?: string) => {
        openRoomWithContext(roomId, jumpToEventId);
    };

    const markAllMentionsRead = async () => {
        await markAllRead();
    };

    const openSettingsSection = (section: 'appearance' | 'voice-video' | 'accessibility') => {
        setSettingsPage(section);
        setSettingsOpen(true);
    };

    const queueCommandForComposer = (command: string) => {
        setComposerCommandPayload({
            nonce: Date.now(),
            roomId: selectedRoomId,
            text: command,
        });
        setComposerCommandStatus(`Ready to send ${command}.`);
    };

    const handleQuickAction = (actionId: QuickActionId) => {
        invokeQuickAction(actionId, {
            openSettings: () => openSettingsSection('appearance'),
            openDevices: () => openSettingsSection('voice-video'),
            toggleInbox: () => setInboxOpen((prev) => !prev),
            openThreads: () => setRightPanel('threads'),
            openSearch: () => setRightPanel('search'),
            openWidgetPanel: (widgetId) => {
                if (!rightPanelPluginEnabled) return;
                setRightPanel(widgetId);
            },
            queueCommand: (command) => {
                void handleCommandPicked(command);
            },
        });
    };

    const handleCommandPicked = async (command: string) => {
        const roomScopedCommands = new Set(['/invite', '/topic', '/me', '/shrug', '/leave']);
        if (roomScopedCommands.has(command) && !selectedRoomId) {
            setComposerCommandStatus(`Select a room before using ${command}.`);
            return;
        }

        if (command === '/leave') {
            if (!selectedRoomId) return;
            try {
                await client.leave(selectedRoomId);
                setSelectedRoomId(null);
                setComposerCommandStatus(`Left den ${selectedRoomId}.`);
            } catch (error) {
                setComposerCommandStatus(
                    error instanceof Error
                        ? `Failed to leave den: ${error.message}`
                        : 'Failed to leave den.'
                );
            }
            return;
        }

        if (command === '/join') {
            const roomAlias = window.prompt('Enter den alias or den ID to join');
            if (!roomAlias?.trim()) {
                setComposerCommandStatus('Join cancelled: den alias is required.');
                return;
            }
            try {
                const joined = await client.joinRoom(roomAlias.trim());
                setSelectedRoomId(joined.roomId ?? roomAlias.trim());
                setSelectedSpaceId(null);
                setComposerCommandStatus(`Joined ${joined.roomId ?? roomAlias.trim()}.`);
            } catch (error) {
                setComposerCommandStatus(
                    error instanceof Error
                        ? `Failed to join den: ${error.message}`
                        : 'Failed to join den.'
                );
            }
            return;
        }

        queueCommandForComposer(command);
    };

    const isForumRoom = useMemo(() => {
        if (!activeRoomState.data) return false;
        const room = activeRoomState.data;
        if (room.getType?.() === 'co.bmc.forum') return true;
        const createType = room.currentState
            ?.getStateEvents('m.room.create', '')
            ?.getContent<Record<string, unknown>>()?.type;
        return createType === 'co.bmc.forum';
    }, [activeRoomState.data]);

    const renderRoomContent = () => {
        if (selectedRoomId) {
            return (
                <div
                    style={{
                        padding: designShellLayout.desktopPanelPaddingPx,
                        display: 'grid',
                        gap: designSpacing.comfortableGapPx,
                    }}
                >
                    <header style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>
                                {rooms.find((room) => room.roomId === selectedRoomId)?.name ??
                                    selectedRoomId}
                            </strong>
                            {callEnabled && callState ? (
                                <button
                                    type="button"
                                    onClick={() => void callState.joinCall(selectedRoomId)}
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-input)',
                                        padding: `2px ${designSpacing.comfortableGapPx - 4}px`,
                                        minHeight: designShellLayout.navRailButtonSizePx,
                                    }}
                                >
                                    📞 Start call
                                </button>
                            ) : (
                                <small
                                    data-testid="feature-widget-element-call-unavailable"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Call unavailable
                                </small>
                            )}
                            {callEnabled &&
                            callState?.joined &&
                            callState.roomId === selectedRoomId ? (
                                <span
                                    style={{
                                        fontSize: 11,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 999,
                                        padding: `2px ${designSpacing.comfortableGapPx - 4}px`,
                                        minHeight: designShellLayout.navRailButtonSizePx,
                                        background: 'rgba(83, 240, 117, 0.2)',
                                    }}
                                    data-testid="header-live-voice-badge"
                                >
                                    Live room
                                    {activeSpeakingCount > 0
                                        ? ` • ${activeSpeakingCount} speaking`
                                        : ''}
                                </span>
                            ) : null}
                        </div>
                        <DeadDropIndicator
                            config={deadDrop.data}
                            queueCount={deadDrop.queueCount}
                        />
                        {composerCommandStatus ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {composerCommandStatus}
                            </div>
                        ) : null}
                    </header>

                    <section
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            height: 'min(62vh, 760px)',
                            minHeight: 360,
                            overflow: 'hidden',
                        }}
                    >
                        {forumEnabled && isForumRoom && roomSurface === 'forum' ? (
                            <ForumView roomId={selectedRoomId} />
                        ) : (
                            <RoomTimeline
                                roomId={selectedRoomId}
                                unreadEventId={unreadMarkerEventId ?? undefined}
                                jumpToEventId={jumpTargetEventId ?? undefined}
                                onJumpResolved={(eventId, found) => {
                                    if (eventId === jumpTargetEventId && found) {
                                        setJumpTargetEventId(null);
                                    }
                                    if (eventId === unreadMarkerEventId && found) {
                                        setUnreadMarkerEventId(null);
                                    }
                                }}
                            />
                        )}
                    </section>

                    {deadDrop.data.enabled ? (
                        <DeadDropComposer roomId={selectedRoomId} />
                    ) : (
                        <MessageComposer roomId={selectedRoomId} />
                    )}

                    <DeadDropSettings roomId={selectedRoomId} />
                </div>
            );
        }
        if (selectedSpaceId) {
            return (
                <div style={{ padding: 16, display: 'grid', gap: 8 }}>
                    {composerCommandStatus ? (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {composerCommandStatus}
                        </div>
                    ) : null}
                    <WelcomeScreen
                        spaceId={selectedSpaceId}
                        actionLabel="Explore"
                        onPickChannel={(roomId) => openRoom(roomId)}
                        onJoinOrExplore={() => setSelectedRoomId(null)}
                    />
                </div>
            );
        }
        return (
            <div style={{ padding: 16, display: 'grid', gap: 8 }}>
                {composerCommandStatus ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {composerCommandStatus}
                    </div>
                ) : null}
                <WelcomeScreen
                    spaceId={onboardingSpaceId}
                    actionLabel="Explore"
                    onPickChannel={(roomId) => openRoom(roomId)}
                    onJoinOrExplore={() => setSelectedRoomId(null)}
                />
            </div>
        );
    };

    const desktop = !isTablet(viewportWidth);
    const mobile = isMobileViewport(viewportWidth);

    return (
        <section
            style={{
                height: '100vh',
                width: '100%',
                display: 'grid',
                gridTemplateColumns: desktop
                    ? `${layout.spaceColumnWidth}px ${layout.roomColumnWidth}px 1fr`
                    : mobile
                    ? '1fr'
                    : '1fr',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
            }}
        >
            <NavigationQuickSwitcher
                open={quickOpen}
                onClose={() => setQuickOpen(false)}
                onCommandPicked={(command) => void handleCommandPicked(command)}
                onActionPicked={(actionId) => {
                    if (actionId === 'mark-read') {
                        void markAllMentionsRead();
                        return;
                    }
                    if (actionId === 'open-inbox') {
                        setInboxOpen(true);
                        return;
                    }
                    if (actionId === 'jump-mentions') {
                        setInboxOpen(true);
                    }
                }}
            />

            {desktop || (!mobile && !selectedRoomId) ? (
                <aside
                    style={{
                        borderRight: '1px solid var(--border-default)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: `${designShellLayout.navRailSectionGapPx}px 0`,
                        gap: designShellLayout.navRailSectionGapPx,
                        background: 'var(--bg-nav)',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedSpaceId(null);
                            setSelectedRoomId(null);
                        }}
                        style={{
                            width: designShellLayout.navRailButtonSizePx,
                            height: designShellLayout.navRailButtonSizePx,
                            borderRadius: 10,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            minWidth: designShellLayout.navRailButtonSizePx,
                            minHeight: designShellLayout.navRailButtonSizePx,
                        }}
                    >
                        🏠
                    </button>
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: designSpacing.denseGapPx,
                            overflowY: 'auto',
                        }}
                    >
                        {orderedSpaces.map((space, idx) => (
                            <button
                                key={space.roomId}
                                type="button"
                                draggable
                                onDragStart={(event: DragEvent<HTMLButtonElement>) =>
                                    event.dataTransfer.setData('text/plain', space.roomId)
                                }
                                onDragOver={(event: DragEvent<HTMLButtonElement>) =>
                                    event.preventDefault()
                                }
                                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                                    event.preventDefault();
                                    const dragged = event.dataTransfer.getData('text/plain');
                                    const next = [...spaceOrder.filter((id) => id !== dragged)];
                                    next.splice(idx, 0, dragged);
                                    void persistSpaceOrder(next);
                                }}
                                onClick={() => {
                                    setSelectedSpaceId(space.roomId);
                                    setSelectedRoomId(null);
                                }}
                                style={{
                                    width: designShellLayout.navRailButtonSizePx,
                                    height: designShellLayout.navRailButtonSizePx,
                                    borderRadius: 12,
                                    border:
                                        selectedSpaceId === space.roomId
                                            ? '1px solid var(--accent-primary)'
                                            : '1px solid var(--border-default)',
                                    background: 'var(--bg-input)',
                                    position: 'relative',
                                }}
                                title={space.name}
                            >
                                {space.name.charAt(0)}
                                {roomUnread(space) > 0 ? (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: -4,
                                            right: -4,
                                            background: 'var(--danger)',
                                            color: '#fff',
                                            borderRadius: 999,
                                            minWidth: 16,
                                            fontSize: 10,
                                        }}
                                    >
                                        {roomUnread(space)}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        style={{
                            width: designShellLayout.navRailButtonSizePx,
                            height: designShellLayout.navRailButtonSizePx,
                            borderRadius: 10,
                            border: '1px dashed var(--border-default)',
                            background: 'var(--bg-input)',
                        }}
                    >
                        ＋
                    </button>
                    {desktop ? (
                        <section
                            style={{
                                width: '100%',
                                borderTop: '1px solid var(--border-default)',
                                padding: designShellLayout.navRailSectionGapPx,
                                display: 'grid',
                                gap: 6,
                            }}
                        >
                            {userId ? (
                                <section
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        padding: designSpacing.denseGapPx,
                                        display: 'grid',
                                        gap: designSpacing.denseGapPx,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <strong style={{ fontSize: 12 }}>Quick actions</strong>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setQuickActionsCollapsed((prev) => !prev)
                                            }
                                            style={{
                                                border: '1px solid var(--border-default)',
                                                borderRadius: 6,
                                                background: 'var(--bg-input)',
                                                fontSize: 11,
                                            }}
                                        >
                                            {quickActionsCollapsed ? 'Expand' : 'Collapse'}
                                        </button>
                                    </div>
                                    {!quickActionsCollapsed ? (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: designSpacing.denseGapPx,
                                            }}
                                        >
                                            {desktopQuickActions.map((entry) => (
                                                <button
                                                    key={entry.id}
                                                    type="button"
                                                    onClick={() => handleQuickAction(entry.id)}
                                                    style={{
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: 6,
                                                        background: 'var(--bg-input)',
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {entry.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    {unseenQuickActionIds.length > 0 ? (
                                        <small style={{ color: 'var(--text-secondary)' }}>
                                            New shortcuts available:{' '}
                                            {unseenQuickActionIds.slice(0, 2).join(', ')}
                                        </small>
                                    ) : null}
                                </section>
                            ) : null}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: 'var(--accent-muted)',
                                    }}
                                />
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {userId ?? 'Anonymous'}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                        Status: {myPresence}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: designSpacing.denseGapPx }}>
                                <button
                                    type="button"
                                    onClick={() => openSettingsSection('appearance')}
                                    style={{
                                        flex: 1,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        fontSize: 11,
                                    }}
                                >
                                    Settings
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openSettingsSection('voice-video')}
                                    style={{
                                        flex: 1,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        fontSize: 11,
                                    }}
                                >
                                    Devices
                                </button>
                            </div>
                        </section>
                    ) : null}
                </aside>
            ) : null}

            {desktop || !mobile ? (
                <aside
                    style={{
                        borderRight: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        display: mobile && selectedRoomId ? 'none' : 'block',
                    }}
                >
                    <header
                        style={{
                            height: 52,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid var(--border-default)',
                            padding: '0 10px',
                        }}
                    >
                        <strong>
                            {selectedSpaceId
                                ? rooms.find((room) => room.roomId === selectedSpaceId)?.name ??
                                  'Canopy'
                                : 'Home'}
                        </strong>
                    </header>

                    <div
                        style={{
                            padding: designShellLayout.navRailSectionGapPx,
                            overflowY: 'auto',
                            height: 'calc(100vh - 52px)',
                        }}
                    >
                        {groups.map((group) => {
                            const collapsed = collapsedFolders[group.id] ?? false;
                            return (
                                <section key={group.id} style={{ marginBottom: 12 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCollapsedFolders((prev) => ({
                                                    ...prev,
                                                    [group.id]: !collapsed,
                                                }))
                                            }
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {collapsed ? '▶' : '▼'} {group.label}
                                        </button>
                                        <button
                                            type="button"
                                            style={{
                                                border: '1px solid var(--border-default)',
                                                borderRadius: 6,
                                                background: 'var(--bg-input)',
                                            }}
                                        >
                                            +
                                        </button>
                                    </div>

                                    {!collapsed ? (
                                        <div style={{ marginTop: 4 }}>
                                            {group.rooms.length === 0 ? (
                                                <small
                                                    style={{
                                                        opacity: 0.8,
                                                        padding: '4px 8px',
                                                        display: 'block',
                                                    }}
                                                >
                                                    No rooms
                                                </small>
                                            ) : null}
                                            {group.rooms.map((room) => (
                                                <button
                                                    key={room.roomId}
                                                    type="button"
                                                    onClick={() => openRoom(room.roomId)}
                                                    style={{
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        border: 'none',
                                                        background:
                                                            selectedRoomId === room.roomId
                                                                ? 'var(--bg-surface-hover)'
                                                                : 'transparent',
                                                        color: 'var(--text-primary)',
                                                        borderRadius: 8,
                                                        padding: `${designSpacing.denseGapPx}px ${
                                                            designSpacing.comfortableGapPx - 4
                                                        }px`,
                                                        minHeight:
                                                            designShellLayout.navRailButtonSizePx,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: designShellLayout.navRailSectionGapPx,
                                                    }}
                                                >
                                                    <span>{roomKindIcon(room)}</span>
                                                    <span
                                                        style={{
                                                            flex: 1,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}
                                                    >
                                                        {room.name}
                                                    </span>
                                                    {callEnabled &&
                                                    callState?.joined &&
                                                    callState.roomId === room.roomId ? (
                                                        <span
                                                            style={{
                                                                border: '1px solid var(--border-default)',
                                                                borderRadius: 999,
                                                                padding: '1px 6px',
                                                                fontSize: 10,
                                                                background:
                                                                    'rgba(83, 240, 117, 0.2)',
                                                            }}
                                                            data-testid="room-list-live-badge"
                                                        >
                                                            LIVE
                                                        </span>
                                                    ) : null}
                                                    {roomUnread(room) > 0 ? (
                                                        <span
                                                            style={{
                                                                background: 'var(--accent-primary)',
                                                                color: 'var(--bg-surface)',
                                                                borderRadius: 999,
                                                                minWidth: 18,
                                                                textAlign: 'center',
                                                                fontSize: 11,
                                                            }}
                                                        >
                                                            {roomUnread(room)}
                                                        </span>
                                                    ) : (
                                                        <span
                                                            style={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                background: 'var(--accent-muted)',
                                                            }}
                                                        />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </section>
                            );
                        })}
                    </div>
                </aside>
            ) : null}

            <main style={{ position: 'relative', minWidth: 0 }}>
                {mobile ? (
                    <header
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 6,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: designShellLayout.navRailSectionGapPx,
                            padding: designShellLayout.navRailSectionGapPx,
                            borderBottom: '1px solid var(--border-default)',
                            background: 'var(--bg-surface)',
                        }}
                    >
                        <div style={{ display: 'flex', gap: 6 }}>
                            {selectedRoomId ? (
                                <button
                                    type="button"
                                    onClick={() => setSelectedRoomId(null)}
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-input)',
                                    }}
                                >
                                    ← Back
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setSelectedSpaceId(null)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-input)',
                                }}
                            >
                                Home
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => openSettingsSection('appearance')}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--bg-input)',
                                padding: `${designSpacing.denseGapPx - 2}px ${
                                    designSpacing.comfortableGapPx - 2
                                }px`,
                                minHeight: designShellLayout.navRailButtonSizePx,
                            }}
                        >
                            Settings
                        </button>
                    </header>
                ) : null}
                {mobile && userId ? (
                    <section
                        style={{
                            borderBottom: '1px solid var(--border-default)',
                            padding: designShellLayout.navRailSectionGapPx,
                            display: 'grid',
                            gap: 6,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <strong style={{ fontSize: 12 }}>Quick actions</strong>
                            <button
                                type="button"
                                onClick={() => setQuickActionsCollapsed((prev) => !prev)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-input)',
                                    padding: `2px ${designSpacing.comfortableGapPx - 4}px`,
                                    minHeight: designShellLayout.navRailButtonSizePx,
                                }}
                            >
                                {quickActionsCollapsed ? 'Expand' : 'Collapse'}
                            </button>
                        </div>
                        {!quickActionsCollapsed ? (
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6 }}>
                                {mobileQuickActions.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() => handleQuickAction(entry.id)}
                                        style={{
                                            whiteSpace: 'nowrap',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 999,
                                            background: 'var(--bg-input)',
                                            padding: `${designSpacing.denseGapPx - 2}px ${
                                                designSpacing.comfortableGapPx - 2
                                            }px`,
                                            minHeight: designShellLayout.navRailButtonSizePx,
                                        }}
                                    >
                                        {entry.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {unseenQuickActionIds.length > 0 ? (
                            <small style={{ color: 'var(--text-secondary)' }}>
                                Tip: try {mobileQuickActions[0]?.label ?? 'quick actions'} to
                                discover newly enabled tools.
                            </small>
                        ) : null}
                    </section>
                ) : null}

                {renderRoomContent()}

                <VoiceStrip
                    enabled={callEnabled && Boolean(callState)}
                    joined={Boolean(callState?.joined)}
                    roomId={callState?.roomId ?? null}
                    selectedRoomId={selectedRoomId}
                    rooms={rooms}
                    muted={Boolean(callState?.muted)}
                    deafened={Boolean(callState?.deafened)}
                    membership={callState?.membership ?? {}}
                    audioLevels={callState?.audioLevels ?? {}}
                    audioDevices={audioDevices}
                    selectedAudioDeviceId={selectedAudioDeviceId}
                    onJoin={(roomId) => void callState?.joinCall(roomId)}
                    onLeave={() => void callState?.leaveCall()}
                    onToggleMuted={() => callState?.setMuted(!callState.muted)}
                    onToggleDeafened={() => callState?.setDeafened(!callState.deafened)}
                    onSelectAudioDevice={(next) => {
                        setSelectedAudioDeviceId(next);
                        callState?.setPreferredAudioDeviceId(next);
                        setSettings((prev) => ({
                            ...prev,
                            preferredAudioDeviceId: next,
                        }));
                    }}
                />

                {!selectedRoomId && !onboardingSuppressed ? (
                    <OnboardingWizard
                        spaceId={onboardingSpaceId}
                        open
                        onClose={() =>
                            setSuppressedOnboardingBySpace((prev) => ({
                                ...prev,
                                [onboardingSpaceId]: true,
                            }))
                        }
                        onComplete={() =>
                            setSuppressedOnboardingBySpace((prev) => ({
                                ...prev,
                                [onboardingSpaceId]: true,
                            }))
                        }
                    />
                ) : null}

                {rightPanel ? (
                    <aside
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 320,
                            height: '100%',
                            background: 'var(--bg-surface)',
                            borderLeft: '1px solid var(--border-default)',
                            boxShadow: '-4px 0 16px rgba(0,0,0,.2)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: 10,
                                borderBottom: '1px solid var(--border-default)',
                            }}
                        >
                            <strong>{rightPanel}</strong>
                            <button type="button" onClick={() => setRightPanel(null)}>
                                Close
                            </button>
                        </div>
                        <RightPanelContent
                            panel={rightPanel}
                            room={activeRoomState.data}
                            events={timelineState.data}
                            rolesEnabled={rolesEnabled}
                            onJumpToEvent={(eventId) => {
                                setJumpTargetEventId(eventId);
                                setRightPanel(null);
                            }}
                        />
                    </aside>
                ) : null}

                {inboxOpen ? (
                    <GlobalMentionsInbox
                        items={mentionItems}
                        onClose={() => setInboxOpen(false)}
                        onMarkAllRead={markAllMentionsRead}
                        onMarkReadLocal={markReadLocal}
                    />
                ) : null}

                {settingsOpen ? (
                    <aside
                        style={{
                            position: 'absolute',
                            inset: 16,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 12,
                            padding: 10,
                            zIndex: 10,
                            overflow: 'auto',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}
                        >
                            <strong>Settings</strong>
                            <button type="button" onClick={() => setSettingsOpen(false)}>
                                Close
                            </button>
                        </div>
                        {mobile ? (
                            <section
                                style={{
                                    marginBottom: 10,
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    padding: 10,
                                    display: 'grid',
                                    gap: designShellLayout.navRailSectionGapPx,
                                }}
                            >
                                <strong style={{ fontSize: 13 }}>Mobile quick settings</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    <button
                                        type="button"
                                        onClick={() => setSettingsPage('appearance')}
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            background: 'var(--bg-input)',
                                            padding: '4px 8px',
                                        }}
                                    >
                                        Theme
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSettingsPage('appearance')}
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            background: 'var(--bg-input)',
                                            padding: '4px 8px',
                                        }}
                                    >
                                        Density
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSettingsPage('accessibility')}
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            background: 'var(--bg-input)',
                                            padding: '4px 8px',
                                        }}
                                    >
                                        Readability
                                    </button>
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: designShellLayout.navRailSectionGapPx,
                                    }}
                                >
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        Den organization
                                    </span>
                                    <select
                                        aria-label="Den organization"
                                        value={settings.mobileRoomListScope ?? 'space'}
                                        onChange={(event) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                mobileRoomListScope: event.target.value as
                                                    | 'space'
                                                    | 'all',
                                            }))
                                        }
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            background: 'var(--bg-input)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <option value="space">Current canopy</option>
                                        <option value="all">All dens</option>
                                    </select>
                                </div>
                            </section>
                        ) : null}
                        <SettingsPage />
                    </aside>
                ) : null}

                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                    {canOpenModerationDashboard ? (
                        inRouterContext ? (
                            <Link
                                to="/moderation/draupnir"
                                style={{
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-input)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                    color: 'var(--text-primary)',
                                    textDecoration: 'none',
                                    fontSize: 13,
                                }}
                            >
                                Moderation
                            </Link>
                        ) : (
                            <a
                                href="/moderation/draupnir"
                                style={{
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-input)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                    color: 'var(--text-primary)',
                                    textDecoration: 'none',
                                    fontSize: 13,
                                }}
                            >
                                Moderation
                            </a>
                        )
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setInboxOpen((prev) => !prev)}
                        style={{
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            borderRadius: 8,
                            padding: '4px 8px',
                        }}
                    >
                        Inbox {mentionItems.length > 0 ? `(${mentionItems.length})` : ''}
                    </button>
                    {forumEnabled && isForumRoom ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setRoomSurface('timeline')}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    background:
                                        roomSurface === 'timeline'
                                            ? 'var(--accent-muted)'
                                            : 'var(--bg-input)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                }}
                            >
                                Timeline
                            </button>
                            <button
                                type="button"
                                onClick={() => setRoomSurface('forum')}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    background:
                                        roomSurface === 'forum'
                                            ? 'var(--accent-muted)'
                                            : 'var(--bg-input)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                }}
                            >
                                Forum
                            </button>
                        </>
                    ) : (
                        <span
                            data-testid="feature-room-bmc-forum-unavailable"
                            style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                        >
                            Forum unavailable
                        </span>
                    )}
                    {rightPanels.map((panel) => (
                        <button
                            key={panel}
                            type="button"
                            onClick={() => setRightPanel(panel)}
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                borderRadius: 8,
                                padding: '4px 8px',
                            }}
                        >
                            {panel}
                        </button>
                    ))}
                </div>
            </main>

            {desktop ? (
                <>
                    <div
                        role="separator"
                        aria-label="Resize canopy sidebar"
                        style={{
                            position: 'fixed',
                            left: layout.spaceColumnWidth - 2,
                            top: 0,
                            width: 4,
                            height: '100vh',
                            cursor: 'col-resize',
                        }}
                        onMouseDown={(event) => {
                            const origin = event.clientX;
                            const start = layout.spaceColumnWidth;
                            const onMove = (moveEvent: MouseEvent) => {
                                const width = Math.min(
                                    designShellLayout.maxSpaceColumnWidthPx,
                                    Math.max(
                                        designShellLayout.minSpaceColumnWidthPx,
                                        start + (moveEvent.clientX - origin)
                                    )
                                );
                                setSettings((prev) => ({
                                    ...prev,
                                    layout: { ...(prev.layout ?? {}), spaceColumnWidth: width },
                                }));
                            };
                            const onUp = () => {
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        }}
                    />
                    <div
                        role="separator"
                        aria-label="Resize den sidebar"
                        style={{
                            position: 'fixed',
                            left: layout.spaceColumnWidth + layout.roomColumnWidth - 2,
                            top: 0,
                            width: 4,
                            height: '100vh',
                            cursor: 'col-resize',
                        }}
                        onMouseDown={(event) => {
                            const origin = event.clientX;
                            const start = layout.roomColumnWidth;
                            const onMove = (moveEvent: MouseEvent) => {
                                const width = Math.min(
                                    designShellLayout.maxRoomColumnWidthPx,
                                    Math.max(
                                        designShellLayout.minRoomColumnWidthPx,
                                        start + (moveEvent.clientX - origin)
                                    )
                                );
                                setSettings((prev) => ({
                                    ...prev,
                                    layout: { ...(prev.layout ?? {}), roomColumnWidth: width },
                                }));
                            };
                            const onUp = () => {
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        }}
                    />
                </>
            ) : null}
        </section>
    );
};

export default ClientLayout;
