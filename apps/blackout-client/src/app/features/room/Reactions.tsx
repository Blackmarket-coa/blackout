import { memo, useCallback, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { userIdAtom } from '../../state/auth';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { mxcToUrl } from '../media/utils/matrixMedia';
import {
    loadRecentReactions,
    pushRecentReaction,
    saveRecentReactions,
} from './recentReactionsStorage';

interface ReactionSummary {
    key: string;
    count: number;
    reactedByMe: boolean;
    reactors: string[];
    eventIdsByUser: Map<string, string>;
    customUrl: string | null;
}

interface ReactionsProps {
    roomId: string;
    targetEventId: string;
    /**
     * Optional emoji list to prepend in the picker's "Recent" row. Consent-
     * shaped proposals pass `['🌱','🌾','🪨']` so the sociocratic palette is
     * the first thing the user sees; non-consent surfaces leave this undefined
     * and fall back to the historical DEFAULT_EMOJI list.
     */
    defaultPalette?: readonly string[];
}

const DEFAULT_EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🔥', '😮', '🙏'];

const findRelation = (event: MatrixEvent): Record<string, unknown> | null => {
    const content = event.getContent<Record<string, unknown>>();
    const relates = content['m.relates_to'];
    return typeof relates === 'object' && relates !== null
        ? (relates as Record<string, unknown>)
        : null;
};

const collectCustomEmoji = (room: Room | null, homeserverUrl: string): Record<string, string> => {
    if (!room) return {};

    const state = room.currentState;
    const eventTypes = ['im.ponies.room_emotes', 'org.matrix.msc2545.emote', 'io.element.emote'];
    const entries: Record<string, string> = {};

    eventTypes.forEach((type) => {
        const stateEvents = state.getStateEvents(type) as MatrixEvent[];
        stateEvents.forEach((event) => {
            const content = event.getContent<Record<string, unknown>>();
            const images = content.images;
            if (typeof images !== 'object' || images === null) return;

            Object.entries(images as Record<string, unknown>).forEach(([shortcode, value]) => {
                if (typeof value !== 'object' || value === null) return;
                const url = (value as Record<string, unknown>).url;
                if (typeof url !== 'string') return;
                const resolved = mxcToUrl(url, homeserverUrl);
                if (resolved) {
                    entries[`:${shortcode}:`] = resolved;
                }
            });
        });
    });

    return entries;
};

const aggregateReactions = (
    timeline: MatrixEvent[],
    targetEventId: string,
    myUserId: string,
    customEmoji: Record<string, string>,
): ReactionSummary[] => {
    const map = new Map<string, ReactionSummary>();

    timeline.forEach((event) => {
        if (event.getType() !== 'm.reaction' || event.isRedacted()) return;
        const relation = findRelation(event);
        if (
            !relation ||
            relation.rel_type !== 'm.annotation' ||
            relation.event_id !== targetEventId
        )
            return;
        if (typeof relation.key !== 'string') return;

        const key = relation.key;
        const sender = event.getSender() ?? 'unknown';
        const existing = map.get(key);
        if (existing) {
            if (!existing.eventIdsByUser.has(sender)) {
                existing.count += 1;
                existing.reactors.push(sender);
                existing.eventIdsByUser.set(sender, event.getId() ?? '');
                existing.reactedByMe = existing.reactedByMe || sender === myUserId;
            }
            return;
        }

        map.set(key, {
            key,
            count: 1,
            reactors: [sender],
            reactedByMe: sender === myUserId,
            eventIdsByUser: new Map([[sender, event.getId() ?? '']]),
            customUrl: customEmoji[key] ?? null,
        });
    });

    return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const EmojiPicker = ({
    customEmoji,
    recents,
    onSelect,
    defaultPalette,
}: {
    customEmoji: Record<string, string>;
    recents: string[];
    onSelect: (emoji: string) => void;
    defaultPalette?: readonly string[];
}) => {
    const seed = defaultPalette ?? DEFAULT_EMOJI;
    const common = [...new Set([...seed, ...recents, ...DEFAULT_EMOJI])].slice(0, 24);
    const custom = Object.entries(customEmoji).slice(0, 30);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '110%',
                right: 0,
                width: 260,
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 8,
                zIndex: 5,
            }}
        >
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>Recent</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {common.map((emoji) => (
                    <button
                        key={emoji}
                        type="button"
                        onClick={() => onSelect(emoji)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            background: 'var(--bg-input)',
                        }}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
            {custom.length > 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>
                    Custom emoji
                </div>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {custom.map(([key, url]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onSelect(key)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            background: 'var(--bg-input)',
                            padding: 2,
                        }}
                    >
                        <img src={url} alt={key} style={{ width: 18, height: 18 }} />
                    </button>
                ))}
            </div>
        </div>
    );
};

export const Reactions = memo(({ roomId, targetEventId, defaultPalette }: ReactionsProps) => {
    const client = useMatrixClient();
    const myUserId = useAtomValue(userIdAtom);
    const { data: room } = useRoom(roomId);
    const { data: timeline } = useRoomTimeline(roomId);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [recent, setRecent] = useState<string[]>(() => loadRecentReactions());
    const [windowStart, setWindowStart] = useState(0);

    const homeserverUrl =
        (client as unknown as { getHomeserverUrl?: () => string }).getHomeserverUrl?.() ?? '';
    const customEmoji = useMemo(
        () => collectCustomEmoji(room, homeserverUrl),
        [homeserverUrl, room],
    );
    const reactions = useMemo(
        () => aggregateReactions(timeline, targetEventId, myUserId ?? '', customEmoji),
        [customEmoji, myUserId, targetEventId, timeline],
    );

    const visibleReactions =
        reactions.length > 20 ? reactions.slice(windowStart, windowStart + 20) : reactions;

    const sendReaction = useCallback(
        async (emoji: string) => {
            await client.sendEvent(
                roomId,
                'm.reaction' as never,
                {
                    'm.relates_to': {
                        rel_type: 'm.annotation',
                        event_id: targetEventId,
                        key: emoji,
                    },
                } as never,
            );

            setRecent((prev) => {
                const next = pushRecentReaction(prev, emoji);
                saveRecentReactions(next);
                return next;
            });
        },
        [client, roomId, targetEventId],
    );

    const toggleReaction = useCallback(
        async (reaction: ReactionSummary) => {
            const myEventId = myUserId ? reaction.eventIdsByUser.get(myUserId) : null;
            if (myEventId) {
                await client.redactEvent(roomId, myEventId);
                return;
            }
            await sendReaction(reaction.key);
        },
        [client, myUserId, roomId, sendReaction],
    );

    if (reactions.length === 0 && !pickerOpen) {
        return (
            <div style={{ marginTop: 6, position: 'relative' }}>
                <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    style={{
                        border: '1px dashed var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-muted)',
                        borderRadius: 999,
                        padding: '2px 8px',
                    }}
                >
                    +
                </button>
                {pickerOpen ? (
                    <EmojiPicker
                        customEmoji={customEmoji}
                        recents={recent}
                        defaultPalette={defaultPalette}
                        onSelect={(emoji) =>
                            void sendReaction(emoji).then(() => setPickerOpen(false))
                        }
                    />
                ) : null}
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                marginTop: 6,
                position: 'relative',
            }}
        >
            {reactions.length > 20 ? (
                <button
                    type="button"
                    onClick={() => setWindowStart((prev) => Math.max(prev - 10, 0))}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 999,
                        background: 'var(--bg-input)',
                    }}
                >
                    ◀
                </button>
            ) : null}

            {visibleReactions.map((reaction) => (
                <button
                    key={reaction.key}
                    type="button"
                    onClick={() => void toggleReaction(reaction)}
                    title={reaction.reactors.join(', ')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 999,
                        border: reaction.reactedByMe
                            ? '1px solid var(--accent-primary)'
                            : '1px solid var(--border-default)',
                        background: reaction.reactedByMe
                            ? 'var(--accent-muted)'
                            : 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '2px 8px',
                        fontSize: 12,
                    }}
                >
                    {reaction.customUrl ? (
                        <img
                            src={reaction.customUrl}
                            alt={reaction.key}
                            style={{ width: 16, height: 16 }}
                        />
                    ) : (
                        <span>{reaction.key}</span>
                    )}
                    <span>{reaction.count}</span>
                </button>
            ))}

            {reactions.length > 20 ? (
                <button
                    type="button"
                    onClick={() =>
                        setWindowStart((prev) =>
                            Math.min(prev + 10, Math.max(reactions.length - 20, 0)),
                        )
                    }
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 999,
                        background: 'var(--bg-input)',
                    }}
                >
                    ▶
                </button>
            ) : null}

            <button
                type="button"
                onClick={() => setPickerOpen((prev) => !prev)}
                style={{
                    border: '1px dashed var(--border-default)',
                    borderRadius: 999,
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    padding: '2px 8px',
                }}
            >
                +
            </button>

            {pickerOpen ? (
                <EmojiPicker
                    customEmoji={customEmoji}
                    recents={recent}
                    defaultPalette={defaultPalette}
                    onSelect={(emoji) => {
                        void sendReaction(emoji);
                        setPickerOpen(false);
                    }}
                />
            ) : null}
        </div>
    );
});

Reactions.displayName = 'Reactions';

export default Reactions;
