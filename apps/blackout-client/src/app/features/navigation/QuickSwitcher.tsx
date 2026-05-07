import React, { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import type { Room, RoomMember } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { settingsPageAtom, type SettingsSectionId } from '../settings/settingsAtoms';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { buildFeatureRegistry } from '../../core/features/buildRegistry';
import { composeShellPanels, selectPanelsByKind } from '../../core/features/composition';
import { defaultFeatureFlags, type FeatureFlags } from '../../core/features/featureFlags';
import { useCapabilityContext } from '../../core/features/capabilityContext';

export type QuickSwitcherActionId = 'mark-read' | 'jump-mentions' | 'open-inbox';

export type QuickSwitcherCategory =
    | 'Rooms'
    | 'Spaces'
    | 'DMs'
    | 'Pages'
    | 'Users'
    | 'Commands'
    | 'Actions'
    | 'Settings';

export interface QuickSwitcherEntry {
    id: string;
    category: QuickSwitcherCategory;
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    badge?: string;
    keywords: string;
    /** Navigation target for `Pages` and `Settings` results. */
    route?: string;
    /** Settings section id to open when activated. */
    settingId?: SettingsSectionId;
    /** Action callback id when activated (Actions entries strip the `action-` prefix from `id`). */
    actionId?: QuickSwitcherActionId;
    /** Tie-break ranking signal sourced from `room.getLastActiveTimestamp()`. */
    lastActive?: number;
    /** Tie-break ranking signal sourced from `room.getUnreadNotificationCount()`. */
    unread?: number;
}

export type QuickSwitcherPageEntry = { id: string; label: string; to: string };

export type QuickSwitcherSettingEntry = {
    id: SettingsSectionId;
    title: string;
    subtitle: string;
};

interface QuickSwitcherProps {
    open: boolean;
    onClose: () => void;
    onCommandPicked?: (command: string) => void;
    onActionPicked?: (actionId: QuickSwitcherActionId) => void;
}

const COMMANDS = [
    { cmd: '/invite', desc: 'Invite a user to this room' },
    { cmd: '/topic', desc: 'Set the room topic' },
    { cmd: '/nick', desc: 'Set your display name' },
    { cmd: '/me', desc: 'Send emote-style message' },
    { cmd: '/shrug', desc: 'Append ¯\\_(ツ)_/¯' },
    { cmd: '/leave', desc: 'Leave the current room' },
    { cmd: '/join', desc: 'Join by room alias' },
];

const ACTIONS: { id: QuickSwitcherActionId; title: string; desc: string }[] = [
    {
        id: 'mark-read',
        title: 'Mark all mentions read',
        desc: 'Clear unread mentions across rooms',
    },
    { id: 'open-inbox', title: 'Open inbox', desc: 'Show the mention inbox panel' },
    { id: 'jump-mentions', title: 'Jump to mentions', desc: 'Open inbox at mention list' },
];

const DEFAULT_SETTINGS: QuickSwitcherSettingEntry[] = [
    { id: 'account', title: 'Account settings', subtitle: 'Profile and account' },
    { id: 'appearance', title: 'Appearance', subtitle: 'Theme, density, font scale' },
    { id: 'notifications', title: 'Notifications', subtitle: 'Sounds, alerts, quiet hours' },
    { id: 'privacy', title: 'Privacy', subtitle: 'Read receipts, blocked users' },
    { id: 'voice-video', title: 'Voice & video', subtitle: 'Devices and call quality' },
    { id: 'accessibility', title: 'Accessibility', subtitle: 'Reduced motion, contrast' },
    { id: 'keybinds', title: 'Keyboard shortcuts', subtitle: 'Customize shortcuts' },
    { id: 'developer', title: 'Developer tools', subtitle: 'Diagnostics and debug' },
    { id: 'about', title: 'About', subtitle: 'Version and credits' },
];

const fuzzyIncludes = (text: string, query: string): boolean => {
    const hay = text.toLowerCase();
    const needle = query.toLowerCase().trim();
    if (!needle) return true;
    let i = 0;
    for (const c of hay) {
        if (c === needle[i]) i += 1;
        if (i === needle.length) return true;
    }
    return hay.includes(needle);
};

const safeCall = <T,>(fn: (() => T) | undefined, fallback: T): T => {
    if (typeof fn !== 'function') return fallback;
    try {
        return fn();
    } catch {
        return fallback;
    }
};

export const buildQuickSwitcherIndex = (
    rooms: readonly Room[],
    pages: readonly QuickSwitcherPageEntry[] = [],
    settings: readonly QuickSwitcherSettingEntry[] = DEFAULT_SETTINGS
): QuickSwitcherEntry[] => {
    const list: QuickSwitcherEntry[] = [];
    const seenUsers = new Set<string>();

    rooms.forEach((room) => {
        const alias =
            safeCall<string | null | undefined>(room.getCanonicalAlias?.bind(room), '') ?? '';
        const unread = safeCall<number>(room.getUnreadNotificationCount?.bind(room), 0);
        const lastActive = safeCall<number>(
            (
                room as unknown as { getLastActiveTimestamp?: () => number }
            ).getLastActiveTimestamp?.bind(room),
            0
        );
        const isSpace =
            safeCall<string | undefined>(room.getType?.bind(room), undefined) === 'm.space';
        const dmInviter = safeCall<string | null | undefined>(
            (
                room as unknown as { getDMInviter?: () => string | null | undefined }
            ).getDMInviter?.bind(room),
            undefined
        );
        const isDm = !isSpace && Boolean(dmInviter);
        const category: QuickSwitcherCategory = isSpace ? 'Spaces' : isDm ? 'DMs' : 'Rooms';

        list.push({
            id: room.roomId,
            category,
            title: room.name,
            subtitle: alias || room.roomId,
            badge: unread > 0 ? String(unread) : undefined,
            keywords: `${room.name} ${alias} ${room.roomId}`,
            lastActive,
            unread,
        });

        const members = safeCall<RoomMember[]>(room.getJoinedMembers?.bind(room), []);
        members.forEach((member) => {
            if (seenUsers.has(member.userId)) return;
            seenUsers.add(member.userId);
            list.push({
                id: member.userId,
                category: 'Users',
                title: member.name || member.userId,
                subtitle: member.userId,
                keywords: `${member.name ?? ''} ${member.userId}`,
            });
        });
    });

    pages.forEach((page) => {
        list.push({
            id: page.id,
            category: 'Pages',
            title: page.label,
            subtitle: page.to,
            keywords: `${page.label} ${page.to}`,
            route: page.to,
        });
    });

    COMMANDS.forEach((command) => {
        list.push({
            id: command.cmd,
            category: 'Commands',
            title: command.cmd,
            subtitle: command.desc,
            keywords: `${command.cmd} ${command.desc}`,
        });
    });

    ACTIONS.forEach((action) => {
        list.push({
            id: `action-${action.id}`,
            actionId: action.id,
            category: 'Actions',
            title: action.title,
            subtitle: action.desc,
            keywords: `${action.title} ${action.desc}`,
        });
    });

    settings.forEach((entry) => {
        list.push({
            id: `settings-${entry.id}`,
            settingId: entry.id,
            category: 'Settings',
            title: entry.title,
            subtitle: entry.subtitle,
            route: `/settings/${entry.id}`,
            keywords: `${entry.title} ${entry.subtitle} settings`,
        });
    });

    return list;
};

const matchScore = (entry: QuickSwitcherEntry, query: string): number => {
    const title = entry.title.toLowerCase();
    if (!query) return 4;
    if (title === query) return 0;
    if (title.startsWith(query)) return 1;
    if (title.includes(query)) return 2;
    return 3;
};

export const rankQuickSwitcherResults = (
    index: readonly QuickSwitcherEntry[],
    query: string
): QuickSwitcherEntry[] => {
    const trimmed = query.toLowerCase().trim();
    const filtered = trimmed
        ? index.filter((entry) => fuzzyIncludes(entry.keywords, trimmed))
        : [...index];

    return filtered.sort((a, b) => {
        const sa = matchScore(a, trimmed);
        const sb = matchScore(b, trimmed);
        if (sa !== sb) return sa - sb;
        const ar = a.lastActive ?? 0;
        const br = b.lastActive ?? 0;
        if (ar !== br) return br - ar;
        const au = a.unread ?? 0;
        const bu = b.unread ?? 0;
        if (au !== bu) return bu - au;
        return 0;
    });
};

const CATEGORY_ORDER: QuickSwitcherCategory[] = [
    'Rooms',
    'Spaces',
    'DMs',
    'Pages',
    'Users',
    'Commands',
    'Actions',
    'Settings',
];

const PER_CATEGORY_CAP = 20;

const categoryLabel = (category: QuickSwitcherCategory): string => {
    if (category === 'Rooms') return BLACKOUT_TERMS.den.titlePlural;
    if (category === 'Spaces') return BLACKOUT_TERMS.canopy.titlePlural;
    return category;
};

const usePageEntries = (): QuickSwitcherPageEntry[] => {
    const ctx = useCapabilityContext();
    const capabilities = ctx.capabilities;
    const flags = ctx.flags;
    return useMemo(() => {
        const registry = buildFeatureRegistry({
            ...defaultFeatureFlags,
            ...(flags ?? {}),
        } as FeatureFlags);
        const panels = selectPanelsByKind(
            composeShellPanels(registry, { capabilities, flags }),
            'sidebar'
        );
        return panels.map((panel) => ({
            id: panel.id,
            label: panel.label,
            to: panel.to,
        }));
    }, [capabilities, flags]);
};

export const QuickSwitcher = ({
    open,
    onClose,
    onCommandPicked,
    onActionPicked,
}: QuickSwitcherProps) => {
    const client = useMatrixClient();
    const pageEntries = usePageEntries();
    const [, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
    const [, setSelectedSpaceId] = useAtom(selectedSpaceIdAtom);
    const setSettingsPage = useSetAtom(settingsPageAtom);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [index, setIndex] = useState<QuickSwitcherEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 150);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        const rebuild = () => setIndex(buildQuickSwitcherIndex(client.getRooms(), pageEntries));
        rebuild();

        const emitter = client as unknown as {
            on: (event: string, cb: () => void) => void;
            off: (event: string, cb: () => void) => void;
        };

        const onSync = () => rebuild();
        const onRoomUpdate = () => rebuild();

        emitter.on('sync', onSync);
        emitter.on('Room', onRoomUpdate);
        emitter.on('Room.name', onRoomUpdate);
        emitter.on('RoomState.events', onRoomUpdate);
        emitter.on('RoomMember.name', onRoomUpdate);

        return () => {
            emitter.off('sync', onSync);
            emitter.off('Room', onRoomUpdate);
            emitter.off('Room.name', onRoomUpdate);
            emitter.off('RoomState.events', onRoomUpdate);
            emitter.off('RoomMember.name', onRoomUpdate);
        };
    }, [client, pageEntries]);

    const ranked = useMemo(
        () => rankQuickSwitcherResults(index, debouncedSearch),
        [debouncedSearch, index]
    );

    const grouped = useMemo(() => {
        const groups: Record<QuickSwitcherCategory, QuickSwitcherEntry[]> = {
            Rooms: [],
            Spaces: [],
            DMs: [],
            Pages: [],
            Users: [],
            Commands: [],
            Actions: [],
            Settings: [],
        };

        ranked.forEach((entry) => {
            if (groups[entry.category].length < PER_CATEGORY_CAP) {
                groups[entry.category].push(entry);
            }
        });

        return groups;
    }, [ranked]);

    const flattened = useMemo(
        () => CATEGORY_ORDER.flatMap((category) => grouped[category]),
        [grouped]
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [debouncedSearch, open]);

    const activate = useCallback(
        async (result: QuickSwitcherEntry) => {
            if (result.category === 'Pages') {
                if (result.route && typeof window !== 'undefined') {
                    window.history.pushState({}, '', result.route);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }
                onClose();
                return;
            }

            if (result.category === 'Rooms' || result.category === 'DMs') {
                setSelectedRoomId(result.id);
                setSelectedSpaceId(null);
                onClose();
                return;
            }

            if (result.category === 'Spaces') {
                setSelectedSpaceId(result.id);
                setSelectedRoomId(null);
                onClose();
                return;
            }

            if (result.category === 'Users') {
                const room = await client.createRoom({
                    is_direct: true,
                    invite: [result.id],
                    preset: 'private_chat' as never,
                });
                setSelectedRoomId(room.room_id);
                onClose();
                return;
            }

            if (result.category === 'Commands') {
                onCommandPicked?.(result.id);
                onClose();
                return;
            }

            if (result.category === 'Actions') {
                if (result.actionId) onActionPicked?.(result.actionId);
                onClose();
                return;
            }

            if (result.category === 'Settings') {
                if (result.settingId) setSettingsPage(result.settingId);
                onClose();
            }
        },
        [
            client,
            onActionPicked,
            onClose,
            onCommandPicked,
            setSelectedRoomId,
            setSelectedSpaceId,
            setSettingsPage,
        ]
    );

    const handleSelectionKey = useCallback(
        (key: string, preventDefault: () => void) => {
            if (key === 'Escape') {
                preventDefault();
                onClose();
                return;
            }

            if (!flattened.length) return;
            if (key === 'ArrowDown') {
                preventDefault();
                setSelectedIndex((prev) => (prev + 1) % flattened.length);
                return;
            }
            if (key === 'ArrowUp') {
                preventDefault();
                setSelectedIndex((prev) => (prev - 1 + flattened.length) % flattened.length);
                return;
            }
            if (key === 'Enter') {
                preventDefault();
                const item = flattened[selectedIndex];
                if (item) void activate(item);
            }
        },
        [activate, flattened, onClose, selectedIndex]
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        handleSelectionKey(event.key, () => event.preventDefault());
    };

    useEffect(() => {
        if (!open) return;
        const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
            handleSelectionKey(event.key, () => event.preventDefault());
        };

        window.addEventListener('keydown', onWindowKeyDown);
        return () => window.removeEventListener('keydown', onWindowKeyDown);
    }, [handleSelectionKey, open]);

    if (!open) return null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 100 }}
            onClick={onClose}
        >
            <section
                style={{
                    width: 'min(880px, 95vw)',
                    margin: '6vh auto',
                    maxHeight: '80vh',
                    border: '1px solid var(--border-default)',
                    borderRadius: 14,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    boxShadow: '0 10px 40px rgba(0,0,0,.35)',
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search rooms, spaces, DMs, members, settings, actions"
                    style={{
                        width: '100%',
                        border: 'none',
                        borderBottom: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '14px 16px',
                        fontSize: 16,
                    }}
                />

                <div style={{ maxHeight: 'calc(80vh - 56px)', overflowY: 'auto', padding: 8 }}>
                    {CATEGORY_ORDER.map((category) => {
                        const items = grouped[category];
                        if (!items.length) return null;
                        return (
                            <div key={category} style={{ marginBottom: 12 }}>
                                <div
                                    style={{
                                        color: 'var(--text-muted)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        padding: '4px 8px',
                                    }}
                                >
                                    {categoryLabel(category)}
                                </div>
                                {items.map((item) => {
                                    const absoluteIndex = flattened.findIndex(
                                        (entry) =>
                                            entry.id === item.id && entry.category === item.category
                                    );
                                    const active = absoluteIndex === selectedIndex;

                                    return (
                                        <button
                                            key={`${item.category}-${item.id}`}
                                            type="button"
                                            onClick={() => void activate(item)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: 'none',
                                                borderRadius: 8,
                                                padding: '8px 10px',
                                                display: 'grid',
                                                gridTemplateColumns: '28px 1fr auto',
                                                gap: 10,
                                                alignItems: 'center',
                                                background: active
                                                    ? 'var(--accent-muted)'
                                                    : 'transparent',
                                                color: 'var(--text-primary)',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: 999,
                                                    background: 'var(--bg-input)',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {item.avatarUrl ? (
                                                    <img
                                                        src={item.avatarUrl}
                                                        alt={item.title}
                                                        style={{ width: '100%', height: '100%' }}
                                                    />
                                                ) : item.category === 'Commands' ? (
                                                    '⌘'
                                                ) : item.category === 'Users' ? (
                                                    '👤'
                                                ) : item.category === 'Spaces' ? (
                                                    '🗂️'
                                                ) : item.category === 'DMs' ? (
                                                    '💬'
                                                ) : item.category === 'Pages' ? (
                                                    '📄'
                                                ) : item.category === 'Settings' ? (
                                                    '⚙️'
                                                ) : item.category === 'Actions' ? (
                                                    '⚡'
                                                ) : (
                                                    '💬'
                                                )}
                                            </span>
                                            <span style={{ minWidth: 0 }}>
                                                <span
                                                    style={{
                                                        display: 'block',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {item.title}
                                                </span>
                                                {item.subtitle ? (
                                                    <span
                                                        style={{
                                                            color: 'var(--text-muted)',
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {item.subtitle}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {item.badge ? (
                                                <span
                                                    style={{
                                                        background: 'var(--accent-primary)',
                                                        color: 'var(--bg-surface)',
                                                        borderRadius: 999,
                                                        fontSize: 11,
                                                        minWidth: 18,
                                                        textAlign: 'center',
                                                        padding: '0 5px',
                                                    }}
                                                >
                                                    {item.badge}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default QuickSwitcher;
