import { type CSSProperties, useMemo, useState } from 'react';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import {
    findThreadRoot,
    getThreadRootIds,
    getTimelineBody,
    groupThreadReplies,
} from '../right-panel/rightPanelUtils';
import { ThreadPanel } from '../right-panel/ThreadPanel';
import { MessageComposer } from '../room/MessageComposer';

const PANEL_WIDTH = 320;

const ASIDE_STYLE: CSSProperties = {
    width: PANEL_WIDTH,
    flex: `0 0 ${PANEL_WIDTH}px`,
    borderLeft: '1px solid var(--border-default)',
    background: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-default)',
    minHeight: 52,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
};

const rootButtonStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    width: '100%',
    textAlign: 'left',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer',
};

const backButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
};

/**
 * Docked threads panel for the canopy server page. Reuses the presentational
 * `ThreadPanel` (replies + thread-mode composer slot) and the shared thread
 * helpers, fed by the same legacy timeline adapter `RoomTimeline` uses, so the
 * in-den thread experience matches the legacy shell without depending on it.
 */
export const CanopyThreadsPanel = ({ roomId }: { roomId: string }) => {
    const timelineState = useRoomTimeline(roomId);
    const events = useMemo(() => timelineState.data ?? [], [timelineState.data]);
    const [activeRoot, setActiveRoot] = useState<string | null>(null);

    const rootIds = useMemo(() => getThreadRootIds(events), [events]);
    const replyGroups = useMemo(() => groupThreadReplies(events), [events]);

    return (
        <aside
            data-testid="canopy-threads-panel"
            data-shell-region="canopy-threads"
            aria-label="Threads"
            style={ASIDE_STYLE}
        >
            <div style={HEADER_STYLE}>
                {activeRoot ? (
                    <button
                        type="button"
                        style={backButtonStyle}
                        onClick={() => setActiveRoot(null)}
                        data-testid="canopy-threads-back"
                    >
                        ← All threads
                    </button>
                ) : (
                    <span>Threads — {rootIds.length}</span>
                )}
            </div>

            {activeRoot ? (
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ThreadPanel
                        events={events}
                        rootEventId={activeRoot}
                        renderComposer={(rootId) => (
                            <MessageComposer
                                roomId={roomId}
                                target={{ mode: 'thread', rootEventId: rootId }}
                                placeholder="Reply in thread"
                            />
                        )}
                    />
                </div>
            ) : (
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {rootIds.length === 0 ? (
                        <small style={{ color: 'var(--text-muted)' }}>
                            No threads yet. Reply to a message in a thread to start one.
                        </small>
                    ) : (
                        rootIds.map((rootId) => {
                            const root = findThreadRoot(events, rootId);
                            const body = root ? getTimelineBody(root) : '';
                            const replyCount = replyGroups.get(rootId)?.length ?? 0;
                            return (
                                <button
                                    key={rootId}
                                    type="button"
                                    style={rootButtonStyle}
                                    onClick={() => setActiveRoot(rootId)}
                                    data-testid="canopy-thread-root"
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {body || 'Thread'}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </aside>
    );
};

export default CanopyThreadsPanel;
