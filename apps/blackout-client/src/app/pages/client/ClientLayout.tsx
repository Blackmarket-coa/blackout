import React, { Suspense, lazy, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { Link, useInRouterContext, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { userIdAtom } from '../../state/auth';
import {
    selectedRoomIdAtom,
    selectedSpaceIdAtom,
    rightPanelAtom,
    roomJumpTargetEventIdAtom,
    roomUnreadMarkerEventIdAtom,
    type RightPanelType,
} from '../../state/navigation';
import { defaultAppSettings, settingsAtom } from '../../state/settings';
import { composerCommandPayloadAtom, composerCommandStatusAtom } from '../../state/composer';
import {
    DeadDropComposer,
    DeadDropIndicator,
    DeadDropSettings,
    useDeadDrop,
} from '../../features/deaddrop';
import MessageComposer from '../../features/room/MessageComposer';
import RoomTimeline from '../../features/room/RoomTimeline';
import { RoomInviteAcceptGate } from '../../features/room/RoomInviteAcceptGate';
import ForumView from '../../features/forum/ForumView';
import CoalitionView from '../../features/coalition/CoalitionView';
import { useCoalitionStateForRoom } from '../../features/coalition/useCoalitionState';
import { QuickSwitcher as NavigationQuickSwitcher } from '../../features/navigation/QuickSwitcher';
import { useMentionNavigation } from '../../features/navigation/useMentionNavigation';
import GlobalMentionsInbox from '../../features/navigation/GlobalMentionsInbox';
import { useInboxModel } from '../../features/navigation/useInboxModel';
import { SettingsPage } from '../../features/settings';
import { useOptionalCall } from '../../features/call';
import { OnboardingWizard, WelcomeScreen } from '../../features/welcome';
import { useRoom, useRoomTimeline } from '../../features/room/hooks/useRoomLegacy';
import RightPanelContent from '../../features/right-panel/RightPanelContent';
import { buildSpaceGroups } from '../../features/right-panel/rightPanelUtils';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { InvitationsManager } from '../../components/invitations';
import { ToastOutlet } from '../../components/toast/ToastOutlet';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { formatMatrixError } from '../../utils/matrixError';
import { buildCommunitiesPath } from '../paths';
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
import { customizationAtom } from '../../state/customization';
import { PrimaryRail } from './PrimaryRail';
import { CreateSpaceModalRenderer } from '../../features/create-space/CreateSpaceModal';
import { CreateRoomModalRenderer } from '../../features/create-room/CreateRoomModal';
import { useOpenCreateSpaceModal } from '../../state/hooks/createSpaceModal';
import { useOpenCreateRoomModal } from '../../state/hooks/createRoomModal';
import { useBindAtoms } from '../../state/hooks/useBindAtoms';
import { OnboardingFlow } from '../../features/onboarding/OnboardingFlow';
import { MessageSearch } from '../../features/message-search/MessageSearch';
import { Lobby } from '../../features/lobby/Lobby';
import { SpaceProvider } from '../../hooks/useSpace';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';

const AttachProductDialog = lazy(() =>
    import('../../components/product-attachment/AttachProductDialog').then((module) => ({
        default: module.AttachProductDialog,
    }))
);

const BASE_RIGHT_PANELS: Exclude<RightPanelType, null>[] = [
    'members',
    'threads',
    'pins',
    'search',
    'notifications',
    'governance',
];

const RIGHT_PANEL_LABELS: Record<Exclude<RightPanelType, null>, string> = {
    members: 'Members',
    threads: 'Threads',
    pins: 'Pins',
    search: 'Search',
    notifications: 'Notifications',
    governance: 'Governance',
    monetization: 'Monetization',
    roles: 'Roles',
    townhall_sfu: 'Townhall SFU',
    widget_shell_layouts: 'Widget layouts',
    media_pipeline: 'Media pipeline',
    media_spoilers: 'Media spoilers',
    media_codeblocks: 'Code blocks',
    media_link_previews: 'Link previews',
    element_call: 'Element call',
    matrix_widget_compat: 'Widget compat',
    soundboard: 'Soundboard',
    numbers_station: 'Numbers station',
    stage_channels: 'Stage channels',
};

const RIGHT_PANEL_TOOLTIPS: Record<Exclude<RightPanelType, null>, string> = {
    members: 'Show members of this den',
    threads: 'Show threads in this den',
    pins: 'Show pinned messages',
    search: 'Search messages in this den',
    notifications: 'Show notifications for this den',
    governance: 'Open the governance dashboard for this den',
    monetization: 'Open monetization tools for this den',
    roles: 'Manage roles for this den',
    townhall_sfu: 'Open the townhall SFU widget',
    widget_shell_layouts: 'Open widget shell layouts',
    media_pipeline: 'Open the media pipeline widget',
    media_spoilers: 'Open the media spoilers widget',
    media_codeblocks: 'Open the code blocks widget',
    media_link_previews: 'Open the link previews widget',
    element_call: 'Open Element Call',
    matrix_widget_compat: 'Open the Matrix widget compatibility shim',
    soundboard: 'Open the soundboard',
    numbers_station: 'Open the numbers station broadcast surface',
    stage_channels: 'Open stage channels',
};

const roomKindIcon = (room: Room): string => {
    const type = room.getType?.() ?? '';
    if (type === 'm.space') return '🗂️';
    if (room.getCanonicalAlias()?.includes('voice')) return '🔊';
    if (room.getCanonicalAlias()?.includes('forum')) return '💬';
    if (room.getCanonicalAlias()?.includes('announce')) return '📢';
    return '💭';
};

const roomUnread = (room: Room): number => room.getUnreadNotificationCount() || 0;

const isTablet = (width: number): boolean => width < 1100;
const isMobile = (width: number): boolean => width < 760;

export const ClientLayout = () => {
    const client = useMatrixClient();
    useBindAtoms(client);
    const rooms = useAtomValue(joinedRoomsAtom);
    const userId = useAtomValue(userIdAtom);
    const [storedSettings, setSettings] = useAtom(settingsAtom);
    const [customization] = useAtom(customizationAtom);
    const settings = storedSettings instanceof Promise ? defaultAppSettings : storedSettings;
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
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [messageSearchOpen, setMessageSearchOpen] = useState(false);
    const messageSearchScrollRef = useRef<HTMLDivElement>(null);
    const [lobbyOpen, setLobbyOpen] = useState(false);
    const [attachProductOpen, setAttachProductOpen] = useState(false);
    const [showGlobalInvitations, setShowGlobalInvitations] = useState(false);
    const [roomSurface, setRoomSurface] = useState<'timeline' | 'forum' | 'coalition'>('timeline');
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
    const {
        canopyId: routeCanopyId,
        denId: routeDenId,
    } = useParams<{ canopyId?: string; denId?: string }>();
    const hasHydratedNavigationRef = useRef(false);

    const layout = settings.layout ?? { spaceColumnWidth: 64, roomColumnWidth: 260 };
    const spaces = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);
    const homeRooms = useMemo(() => rooms.filter((room) => room.getType() !== 'm.space'), [rooms]);
    const featureEntrypointRegistry = useMemo(
        () =>
            buildFeatureEntrypointRegistry({
                preset: customization.activePreset,
                flags: {
                    ...customization.features,
                    // Bridge the runtime flag onto the preset gate so the
                    // env-driven `BLACKOUT_PRODUCTS_ATTACH_COMPOSER` rollout
                    // toggles the composer entry without a deployment-tier
                    // upgrade. Hidden by default in every preset; visible
                    // only when the flag is on.
                    'features.bmc.productAttachments':
                        customization.features['features.bmc.productAttachments'] ??
                        runtimeFeatureFlags.productsAttachComposer,
                },
            }),
        [customization.activePreset, customization.features]
    );
    const featureFlags = featureEntrypointRegistry.flags;
    const rolesEnabled = featureFlags['features.bmc.roles'] ?? false;
    const callEnabled = featureFlags['features.call.elementCall'] ?? false;
    const forumEnabled = featureFlags['features.bmc.forum'] ?? false;
    const coalitionEnabled = featureFlags['features.bmc.coalition'] ?? true;
    const coalitionDenState = useCoalitionStateForRoom(selectedRoomId ?? null);
    const rightPanels = useMemo(
        () => [...BASE_RIGHT_PANELS, ...(rolesEnabled ? (['roles'] as const) : [])],
        [rolesEnabled]
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
        const nextPanelParam = params.get('panel');
        const nextJumpTargetEventId = params.get('event');
        const nextRightPanel = rightPanels.includes(nextPanelParam as Exclude<RightPanelType, null>)
            ? (nextPanelParam as RightPanelType)
            : null;
        // Canopy/den come from the route params. Sentinel "-" denotes no
        // parent canopy (direct rooms / home-roomed entities).
        const decodedRouteCanopy = (() => {
            if (!routeCanopyId) return null;
            if (routeCanopyId === '-') return null;
            try {
                return decodeURIComponent(routeCanopyId);
            } catch {
                return routeCanopyId;
            }
        })();
        const decodedRouteDen = (() => {
            if (!routeDenId) return null;
            try {
                return decodeURIComponent(routeDenId);
            } catch {
                return routeDenId;
            }
        })();
        const nextSpaceId = decodedRouteCanopy ?? params.get('space');
        const effectiveRoomId = decodedRouteDen ?? null;
        const hasUrlNavigationState = Boolean(
            effectiveRoomId || nextSpaceId || nextPanelParam || nextJumpTargetEventId
        );

        if (!hasUrlNavigationState && !hasHydratedNavigationRef.current) {
            hasHydratedNavigationRef.current = true;
            return;
        }

        setSelectedRoomId(effectiveRoomId);
        setSelectedSpaceId(nextSpaceId);
        setRightPanel(nextRightPanel);
        setJumpTargetEventId(nextJumpTargetEventId);
        hasHydratedNavigationRef.current = true;
    }, [
        location.search,
        rightPanels,
        routeCanopyId,
        routeDenId,
        setJumpTargetEventId,
        setRightPanel,
        setSelectedRoomId,
        setSelectedSpaceId,
    ]);

    useEffect(() => {
        if (!hasHydratedNavigationRef.current) return;

        const params = new URLSearchParams();
        if (rightPanel) params.set('panel', rightPanel);
        if (jumpTargetEventId) params.set('event', jumpTargetEventId);

        // The canonical canopy/den path is the only chat-surface URL
        // shape since PR-10 retired `/room/:roomId`. When no den is
        // selected we fall back to the bare `/communities` root rather
        // than `/` so the AppShell stays in community mode.
        const pathname = selectedRoomId
            ? buildCommunitiesPath(selectedSpaceId, selectedRoomId)
            : selectedSpaceId
            ? buildCommunitiesPath(selectedSpaceId, null)
            : '/';

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

    const openCreateSpaceModal = useOpenCreateSpaceModal();
    const openCreateRoomModal = useOpenCreateRoomModal();
    const startNewDen = () => {
        if (selectedSpaceId) {
            openCreateRoomModal(selectedSpaceId);
        } else if (orderedSpaces.length === 0) {
            openCreateSpaceModal();
        } else {
            openCreateRoomModal(orderedSpaces[0]?.roomId);
        }
    };

    const exploreOrCreate = () => {
        if (orderedSpaces.length === 0) {
            navigate('/communities');
        } else {
            startNewDen();
        }
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
            openWidgetPanel: (widgetId) => setRightPanel(widgetId),
            queueCommand: (command) => {
                void handleCommandPicked(command);
            },
            openAttachProductDialog: () => setAttachProductOpen(true),
        });
    };

    const handleProductAttach = (event: {
        type: string;
        content: { version: 1; listings: ReadonlyArray<unknown> };
    }): void => {
        if (!selectedRoomId) {
            setComposerCommandStatus(
                `Select a ${BLACKOUT_TERMS.den.singular} before attaching a product.`
            );
            return;
        }
        void (
            client as unknown as {
                sendEvent: (
                    roomId: string,
                    eventType: string,
                    content: Record<string, unknown>
                ) => Promise<unknown>;
            }
        ).sendEvent(selectedRoomId, event.type, {
            version: event.content.version,
            listings: [...event.content.listings],
        });
        setComposerCommandStatus('Product attachment queued.');
    };

    const handleCommandPicked = async (command: string) => {
        const roomScopedCommands = new Set(['/invite', '/topic', '/me', '/shrug', '/leave']);
        if (roomScopedCommands.has(command) && !selectedRoomId) {
            setComposerCommandStatus(
                `Select a ${BLACKOUT_TERMS.den.singular} before using ${command}.`
            );
            return;
        }

        if (command === '/leave') {
            if (!selectedRoomId) return;
            try {
                await client.leave(selectedRoomId);
                setSelectedRoomId(null);
                setComposerCommandStatus(`Left ${BLACKOUT_TERMS.den.singular} ${selectedRoomId}.`);
            } catch (error) {
                setComposerCommandStatus(
                    `Failed to leave ${BLACKOUT_TERMS.den.singular}: ${formatMatrixError(
                        error,
                        'please try again.'
                    )}`
                );
            }
            return;
        }

        if (command === '/join') {
            const roomAlias = window.prompt(
                `Enter a ${BLACKOUT_TERMS.den.singular} alias or Matrix room ID to join`
            );
            if (!roomAlias?.trim()) {
                setComposerCommandStatus(
                    `Join cancelled: a ${BLACKOUT_TERMS.den.singular} alias or Matrix room ID is required.`
                );
                return;
            }
            try {
                const joined = await client.joinRoom(roomAlias.trim());
                setSelectedRoomId(joined.roomId ?? roomAlias.trim());
                setSelectedSpaceId(null);
                setComposerCommandStatus(`Joined ${joined.roomId ?? roomAlias.trim()}.`);
            } catch (error) {
                setComposerCommandStatus(
                    `Failed to join ${BLACKOUT_TERMS.den.singular}: ${formatMatrixError(
                        error,
                        'please try again.'
                    )}`
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
                <div style={{ padding: 16, display: 'grid', gap: 12 }}>
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
                                        padding: '2px 8px',
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

                    <RoomInviteAcceptGate
                        roomId={selectedRoomId}
                        canopyId={routeCanopyId ?? selectedSpaceId ?? undefined}
                    >
                    <section
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            height: 'min(62vh, 760px)',
                            minHeight: 360,
                            overflow: 'hidden',
                        }}
                    >
                        {coalitionEnabled &&
                        coalitionDenState.enabled &&
                        roomSurface === 'coalition' ? (
                            <CoalitionView
                                denId={selectedRoomId}
                                canopyId={coalitionDenState.canopyId ?? selectedSpaceId ?? null}
                                enabledTabs={
                                    coalitionDenState.enabledTabs.length > 0
                                        ? coalitionDenState.enabledTabs
                                        : undefined
                                }
                                scopeLabel={`Den · ${
                                    rooms.find((room) => room.roomId === selectedRoomId)?.name ??
                                    selectedRoomId
                                }`}
                            />
                        ) : forumEnabled && isForumRoom && roomSurface === 'forum' ? (
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
                    </RoomInviteAcceptGate>
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
                        actionLabel={`Explore ${BLACKOUT_TERMS.den.plural}`}
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
                    actionLabel={
                        orderedSpaces.length === 0
                            ? `Explore ${BLACKOUT_TERMS.canopy.plural}`
                            : `New ${BLACKOUT_TERMS.den.singular}`
                    }
                    onPickChannel={(roomId) => openRoom(roomId)}
                    onJoinOrExplore={exploreOrCreate}
                    joinedCanopies={orderedSpaces}
                    onPickCanopy={(roomId) => {
                        setSelectedSpaceId(roomId);
                        setSelectedRoomId(null);
                    }}
                />
            </div>
        );
    };

    const desktop = !isTablet(viewportWidth);
    const mobile = isMobile(viewportWidth);

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
            />

            <ToastOutlet />

            {desktop || (!mobile && !selectedRoomId) ? (
                <PrimaryRail
                    onCreateCanopy={() => openCreateSpaceModal()}
                    homeButton={
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSpaceId(null);
                                setSelectedRoomId(null);
                                navigate('/');
                            }}
                            title="Home"
                            aria-label="Home"
                            data-testid="primary-rail-home"
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                            }}
                        >
                            🏠
                        </button>
                    }
                    inviteButton={
                        <button
                            type="button"
                            onClick={() => setShowGlobalInvitations(true)}
                            title="Create an invite link"
                            aria-label="Create an invite link"
                            data-testid="primary-rail-invite"
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                            }}
                        >
                            ✉️
                        </button>
                    }
                    canopyBlock={orderedSpaces.map((space, idx) => (
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
                                width: 40,
                                height: 40,
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
                    avatarButton={
                        desktop && userId ? (
                            <button
                                type="button"
                                onClick={() => openSettingsSection('appearance')}
                                title={`${userId} — open settings`}
                                aria-label="Open settings"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: '50%',
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--accent-muted)',
                                    color: 'var(--text-primary)',
                                    fontSize: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {userId.replace(/^@/, '').charAt(0).toUpperCase()}
                            </button>
                        ) : null
                    }
                />
            ) : null}

            {desktop || !mobile ? (
                <aside
                    style={{
                        borderRight: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        display: mobile && selectedRoomId ? 'none' : 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        height: '100vh',
                    }}
                >
                    <header
                        style={{
                            height: 52,
                            flex: '0 0 auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid var(--border-default)',
                            padding: '0 10px',
                        }}
                    >
                        <strong
                            style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {selectedSpaceId
                                ? rooms.find((room) => room.roomId === selectedSpaceId)?.name ??
                                  BLACKOUT_TERMS.canopy.title
                                : 'Home'}
                        </strong>
                    </header>

                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            padding: 8,
                            overflowY: 'auto',
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
                                            onClick={startNewDen}
                                            title={`New ${BLACKOUT_TERMS.den.singular}`}
                                            aria-label={`New ${BLACKOUT_TERMS.den.singular}`}
                                            style={{
                                                border: '1px solid var(--border-default)',
                                                borderRadius: 6,
                                                background: 'var(--bg-input)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                padding: '0 6px',
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
                                                    No {BLACKOUT_TERMS.den.plural}
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
                                                        padding: '6px 8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
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

                    {desktop ? (
                        <footer
                            style={{
                                flex: '0 0 auto',
                                borderTop: '1px solid var(--border-default)',
                                padding: 8,
                                display: 'grid',
                                gap: 6,
                                background: 'var(--bg-nav)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    minWidth: 0,
                                }}
                            >
                                <div
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: 'var(--accent-muted)',
                                        flex: '0 0 auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                    }}
                                >
                                    {(userId ?? 'A').replace(/^@/, '').charAt(0).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {userId ?? 'Anonymous'}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {myPresence}
                                        {callState?.joined
                                            ? ` • In call (${
                                                  Object.keys(callState.membership).length
                                              })`
                                            : ''}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setMessageSearchOpen(true)}
                                    title="Search messages"
                                    aria-label="Search messages"
                                    style={{
                                        flex: '0 0 auto',
                                        width: 28,
                                        height: 28,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    🔍
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openSettingsSection('voice-video')}
                                    title="Audio & video devices"
                                    aria-label="Devices"
                                    style={{
                                        flex: '0 0 auto',
                                        width: 28,
                                        height: 28,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    🎧
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openSettingsSection('appearance')}
                                    title="Settings"
                                    aria-label="Settings"
                                    style={{
                                        flex: '0 0 auto',
                                        width: 28,
                                        height: 28,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    ⚙
                                </button>
                            </div>

                            {callState?.joined ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        type="button"
                                        onClick={() => callState.setMuted(!callState.muted)}
                                        style={{
                                            flex: 1,
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 6,
                                            background: 'var(--bg-input)',
                                            color: 'var(--text-primary)',
                                            fontSize: 12,
                                            padding: '4px 6px',
                                        }}
                                    >
                                        {callState.muted ? 'Unmute' : 'Mute'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => callState.setDeafened(!callState.deafened)}
                                        style={{
                                            flex: 1,
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 6,
                                            background: 'var(--bg-input)',
                                            color: 'var(--text-primary)',
                                            fontSize: 12,
                                            padding: '4px 6px',
                                        }}
                                    >
                                        {callState.deafened ? 'Undeafen' : 'Deafen'}
                                    </button>
                                </div>
                            ) : null}

                            {desktopQuickActions.length > 0 ? (
                                <details>
                                    <summary
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Quick actions
                                        {unseenQuickActionIds.length > 0
                                            ? ` (${unseenQuickActionIds.length} new)`
                                            : ''}
                                    </summary>
                                    <div
                                        style={{
                                            marginTop: 6,
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 4,
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
                                                    color: 'var(--text-primary)',
                                                    fontSize: 11,
                                                    padding: '2px 8px',
                                                }}
                                            >
                                                {entry.label}
                                            </button>
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                        </footer>
                    ) : null}
                </aside>
            ) : null}

            <main
                style={{
                    position: 'relative',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100vh',
                    overflow: 'hidden',
                }}
            >
                {mobile ? (
                    <header
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 6,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: 8,
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
                                padding: '4px 10px',
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
                            padding: 8,
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
                                    padding: '2px 8px',
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
                                            padding: '4px 10px',
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

                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        paddingTop: 44,
                    }}
                >
                    {renderRoomContent()}
                </div>

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

                {!selectedRoomId && selectedSpaceId ? (
                    <div
                        style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            display: 'flex',
                            gap: 8,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setLobbyOpen(true)}
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 999,
                                padding: '4px 12px',
                                fontSize: 12,
                                cursor: 'pointer',
                            }}
                        >
                            Hierarchy
                        </button>
                        <button
                            type="button"
                            onClick={() => setOnboardingOpen(true)}
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 999,
                                padding: '4px 12px',
                                fontSize: 12,
                                cursor: 'pointer',
                            }}
                        >
                            Continue setup →
                        </button>
                    </div>
                ) : null}

                {rightPanel ? (
                    <aside
                        data-testid="right-panel"
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
                                    gap: 8,
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
                                        gap: 8,
                                    }}
                                >
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        Den organization
                                    </span>
                                    <select
                                        data-testid="mobile-den-organization"
                                        aria-label="Den organization"
                                        value={settings.mobileRoomListScope ?? 'space'}
                                        onChange={(event) =>
                                            setSettings({
                                                ...settings,
                                                mobileRoomListScope: event.target.value as
                                                    | 'space'
                                                    | 'all',
                                            })
                                        }
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            background: 'var(--bg-input)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <option value="space">
                                            Current {BLACKOUT_TERMS.canopy.singular}
                                        </option>
                                        <option value="all">All {BLACKOUT_TERMS.den.plural}</option>
                                    </select>
                                </div>
                            </section>
                        ) : null}
                        <SettingsPage />
                    </aside>
                ) : null}

                <div
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: 6,
                        maxWidth: 'calc(100% - 16px)',
                        zIndex: 4,
                        background: 'var(--bg-surface)',
                        padding: 4,
                        borderRadius: 10,
                    }}
                >
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
                                    whiteSpace: 'nowrap',
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
                                    whiteSpace: 'nowrap',
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
                            color: 'var(--text-primary)',
                            borderRadius: 8,
                            padding: '4px 8px',
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Inbox {mentionItems.length > 0 ? `(${mentionItems.length})` : ''}
                    </button>
                    {selectedRoomId && forumEnabled && isForumRoom ? (
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
                                    color: 'var(--text-primary)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                    fontSize: 13,
                                    whiteSpace: 'nowrap',
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
                                    color: 'var(--text-primary)',
                                    borderRadius: 8,
                                    padding: '4px 8px',
                                    fontSize: 13,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Forum
                            </button>
                        </>
                    ) : selectedRoomId ? (
                        <span
                            data-testid="feature-room-bmc-forum-unavailable"
                            style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                                padding: '0 4px',
                            }}
                        >
                            Forum unavailable
                        </span>
                    ) : null}
                    {selectedRoomId && coalitionEnabled && coalitionDenState.enabled ? (
                        <button
                            type="button"
                            data-testid="feature-room-bmc-coalition-toggle"
                            onClick={() =>
                                setRoomSurface((prev) =>
                                    prev === 'coalition' ? 'timeline' : 'coalition'
                                )
                            }
                            style={{
                                border: '1px solid var(--border-default)',
                                background:
                                    roomSurface === 'coalition'
                                        ? 'var(--accent-muted)'
                                        : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 8,
                                padding: '4px 8px',
                                fontSize: 13,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Coalition
                        </button>
                    ) : null}
                    <DenInviteButtonsForSelectedRoom roomId={selectedRoomId} />
                    {selectedRoomId
                        ? rightPanels.map((panel) => (
                              <button
                                  key={panel}
                                  type="button"
                                  onClick={() => setRightPanel(panel)}
                                  aria-label={RIGHT_PANEL_TOOLTIPS[panel]}
                                  title={RIGHT_PANEL_TOOLTIPS[panel]}
                                  aria-pressed={rightPanel === panel}
                                  style={{
                                      border: '1px solid var(--border-default)',
                                      background:
                                          rightPanel === panel
                                              ? 'var(--accent-muted, var(--bg-input))'
                                              : 'var(--bg-input)',
                                      color: 'var(--text-primary)',
                                      borderRadius: 8,
                                      padding: '4px 8px',
                                      fontSize: 13,
                                      whiteSpace: 'nowrap',
                                  }}
                              >
                                  {RIGHT_PANEL_LABELS[panel]}
                              </button>
                          ))
                        : null}
                </div>
            </main>

            {desktop ? (
                <>
                    <div
                        role="separator"
                        aria-label="Resize canopy rail"
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
                                    96,
                                    Math.max(52, start + (moveEvent.clientX - origin))
                                );
                                setSettings({
                                    ...settings,
                                    layout: { ...(settings.layout ?? {}), spaceColumnWidth: width },
                                });
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
                        aria-label="Resize den list"
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
                                    360,
                                    Math.max(220, start + (moveEvent.clientX - origin))
                                );
                                setSettings({
                                    ...settings,
                                    layout: { ...(settings.layout ?? {}), roomColumnWidth: width },
                                });
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

            {lobbyOpen && selectedSpaceId ? (
                <aside
                    role="dialog"
                    aria-label="Canopy hierarchy"
                    style={{
                        position: 'fixed',
                        inset: 24,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 12,
                        zIndex: 20,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <header
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--border-default)',
                        }}
                    >
                        <strong>
                            {rooms.find((room) => room.roomId === selectedSpaceId)?.name ??
                                BLACKOUT_TERMS.canopy.title}{' '}
                            · Hierarchy
                        </strong>
                        <button
                            type="button"
                            onClick={() => setLobbyOpen(false)}
                            aria-label="Close hierarchy"
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </header>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <SpaceProvider
                            value={rooms.find((room) => room.roomId === selectedSpaceId) ?? null}
                        >
                            <Lobby
                                onOpenRoom={(roomId) => {
                                    setLobbyOpen(false);
                                    openRoom(roomId);
                                }}
                            />
                        </SpaceProvider>
                    </div>
                </aside>
            ) : null}

            {messageSearchOpen ? (
                <aside
                    role="dialog"
                    aria-label="Search messages"
                    style={{
                        position: 'fixed',
                        inset: 24,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 12,
                        zIndex: 20,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <header
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--border-default)',
                        }}
                    >
                        <strong>Search messages</strong>
                        <button
                            type="button"
                            onClick={() => setMessageSearchOpen(false)}
                            aria-label="Close search"
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </header>
                    <div
                        ref={messageSearchScrollRef}
                        style={{ flex: 1, overflowY: 'auto', padding: 16 }}
                    >
                        <MessageSearch
                            defaultRoomsFilterName={
                                selectedRoomId
                                    ? rooms.find((room) => room.roomId === selectedRoomId)?.name ??
                                      'Current den'
                                    : `All ${BLACKOUT_TERMS.den.plural}`
                            }
                            allowGlobal
                            rooms={
                                selectedRoomId
                                    ? [selectedRoomId]
                                    : homeRooms.map((room) => room.roomId)
                            }
                            scrollRef={messageSearchScrollRef}
                            onOpen={(roomId, eventId) => {
                                setMessageSearchOpen(false);
                                openRoom(roomId, eventId);
                            }}
                        />
                    </div>
                </aside>
            ) : null}

            {onboardingOpen ? (
                <aside
                    role="dialog"
                    aria-label="Community onboarding"
                    style={{
                        position: 'fixed',
                        inset: 24,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 12,
                        zIndex: 20,
                        overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                        padding: 16,
                    }}
                >
                    <header
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingBottom: 8,
                            borderBottom: '1px solid var(--border-default)',
                            marginBottom: 12,
                        }}
                    >
                        <strong>Community onboarding</strong>
                        <button
                            type="button"
                            onClick={() => setOnboardingOpen(false)}
                            aria-label="Close onboarding"
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </header>
                    <OnboardingFlow
                        spaceId={onboardingSpaceId}
                        onClose={() => setOnboardingOpen(false)}
                        onCompleted={() => setOnboardingOpen(false)}
                    />
                </aside>
            ) : null}

            <CreateSpaceModalRenderer />
            <CreateRoomModalRenderer />
            {showGlobalInvitations ? (
                <InvitationsManager
                    requestClose={() => setShowGlobalInvitations(false)}
                />
            ) : null}
            {attachProductOpen ? (
                <Suspense fallback={null}>
                    <AttachProductDialog
                        open={attachProductOpen}
                        onClose={() => setAttachProductOpen(false)}
                        onAttach={handleProductAttach}
                    />
                </Suspense>
            ) : null}
        </section>
    );
};

/**
 * Resolves the selected room id into a Room and renders the den-level
 * invite toolbar buttons. Split out so the permission hooks
 * (`usePowerLevels` etc.) always run against a non-null Room, sidestepping
 * the rule-of-hooks issue conditional rendering would create at the
 * parent.
 */
const DenInviteButtonsForSelectedRoom: React.FC<{ roomId: string | null }> = ({ roomId }) => {
    const mx = useMatrixClient();
    if (!roomId) return null;
    const room = mx.getRoom(roomId);
    if (!room) return null;
    return <DenInviteButtons room={room} />;
};

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 13,
    whiteSpace: 'nowrap',
};

const DenInviteButtons: React.FC<{ room: Room }> = ({ room }) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const [showInvite, setShowInvite] = useState(false);
    const [showShareLink, setShowShareLink] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setShowInvite(true)}
                disabled={!canInvite}
                title={canInvite ? 'Invite a user by Matrix ID' : 'You don’t have permission to invite here'}
                aria-label="Invite a user"
                style={{
                    ...buttonStyle,
                    cursor: canInvite ? 'pointer' : 'not-allowed',
                    opacity: canInvite ? 1 : 0.5,
                }}
            >
                Invite
            </button>
            <button
                type="button"
                onClick={() => setShowShareLink(true)}
                disabled={!canInvite}
                title={
                    canInvite
                        ? 'Create a shareable invite link for this room'
                        : 'You don’t have permission to invite here'
                }
                aria-label="Share an invite link"
                style={{
                    ...buttonStyle,
                    cursor: canInvite ? 'pointer' : 'not-allowed',
                    opacity: canInvite ? 1 : 0.5,
                }}
            >
                Share link
            </button>
            {showInvite && (
                <InviteUserPrompt room={room} requestClose={() => setShowInvite(false)} />
            )}
            {showShareLink && (
                <InvitationsManager
                    roomId={room.roomId}
                    requestClose={() => setShowShareLink(false)}
                />
            )}
        </>
    );
};

export default ClientLayout;
