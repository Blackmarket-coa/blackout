import React, { type CSSProperties, type ReactNode } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import {
    findThreadRoot,
    getEventTimestamp,
    getTimelineBody,
    groupThreadReplies,
} from './rightPanelUtils';

export interface ThreadPanelProps {
    /**
     * The right-panel event window. Both the root and its replies are
     * looked up inside this list, so callers should make sure the window
     * spans the thread's age (pagination-aware callers should widen the
     * window before mounting the panel).
     */
    events: MatrixEvent[];
    /** Root event id of the thread to render. */
    rootEventId: string;
    /**
     * Optional render slot for the thread-mode composer. The parent
     * wires the canonical `MessageComposer` with `target.mode='thread'`
     * + `target.rootEventId={rootEventId}`. When omitted the panel
     * renders a "Reply in thread" affordance that calls `onReply`.
     */
    renderComposer?: (rootEventId: string) => ReactNode;
    /** Fallback handler when `renderComposer` is not provided. */
    onReply?: (rootEventId: string) => void;
    /** Jump-to-event handler — passed to root + reply rows. */
    onJumpToEvent?: (eventId: string) => void;
    /** Fallback label when an event has no body (e.g. encrypted preview). */
    fallbackBody?: string;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    gap: 12,
    padding: 12,
};

const headerStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--bg-surface)',
};

const repliesScrollStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const replyCardStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
};

const composerSlotStyle: CSSProperties = {
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    paddingTop: 12,
};

const emptyStyle: CSSProperties = {
    color: 'var(--text-secondary)',
    margin: 0,
    fontSize: 13,
};

const senderStyle: CSSProperties = { fontWeight: 600 };
const metaStyle: CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: 12,
};
const bodyStyle: CSSProperties = { margin: 0, whiteSpace: 'pre-wrap' };

const getSender = (event: MatrixEvent): string => {
    const sender = (event as unknown as { getSender?: () => string | null | undefined }).getSender?.();
    return sender ?? 'unknown';
};

const renderEventBody = (event: MatrixEvent, fallback: string): string => {
    const body = getTimelineBody(event);
    return body || fallback;
};

/**
 * In-room thread panel — Workstream C ("Thread panel renders root +
 * replies + composer in thread mode" exit criterion,
 * deferred-bodies-schedule-2026-05-01.md). Composes the pure
 * thread-tree helpers from `rightPanelUtils` into a tree UI:
 *
 *   Header  — thread root event (body + sender + timestamp)
 *   Body    — chronological reply list, each with sender + timestamp
 *   Footer  — composer slot (parent injects `MessageComposer` with
 *             `target.mode='thread'` + `target.rootEventId`)
 *
 * Presentational by design: takes the event window + the root id as
 * props and looks up the root + replies inline via `findThreadRoot` /
 * `groupThreadReplies`. The composer is a render-slot so the
 * panelSlots wiring can stay matrix-client-aware while this component
 * stays trivially testable.
 *
 * When the root isn't in the supplied window, renders a "Root not in
 * view — pull to load" empty state so the panel doesn't blank out
 * during pagination. When no replies have landed yet, renders a
 * neutral "No replies yet" empty state.
 */
export function ThreadPanel({
    events,
    rootEventId,
    renderComposer,
    onReply,
    onJumpToEvent,
    fallbackBody = '[thread message]',
}: ThreadPanelProps) {
    const root = findThreadRoot(events, rootEventId);
    const replies = groupThreadReplies(events).get(rootEventId) ?? [];

    return (
        <section
            data-testid="thread-panel"
            data-root-event-id={rootEventId}
            style={containerStyle}
        >
            {root ? (
                <header
                    data-testid="thread-panel-root"
                    style={headerStyle}
                    onClick={onJumpToEvent ? () => onJumpToEvent(rootEventId) : undefined}
                    role={onJumpToEvent ? 'button' : undefined}
                    tabIndex={onJumpToEvent ? 0 : undefined}
                >
                    <span style={metaStyle}>Thread root</span>
                    <span style={senderStyle}>{getSender(root)}</span>
                    <p style={bodyStyle}>{renderEventBody(root, fallbackBody)}</p>
                    <span style={metaStyle}>{getEventTimestamp(root)}</span>
                </header>
            ) : (
                <p data-testid="thread-panel-root-missing" style={emptyStyle}>
                    Thread root not loaded in this view — scroll up to fetch the message.
                </p>
            )}

            <div style={repliesScrollStyle} data-testid="thread-panel-replies">
                {replies.length === 0 ? (
                    <p data-testid="thread-panel-empty" style={emptyStyle}>
                        No replies yet. Be the first to respond.
                    </p>
                ) : (
                    replies.map((reply) => {
                        const replyId = reply.getId?.() ?? '';
                        return (
                            <article
                                key={replyId}
                                data-testid={`thread-panel-reply-${replyId}`}
                                style={replyCardStyle}
                                onClick={
                                    onJumpToEvent && replyId
                                        ? () => onJumpToEvent(replyId)
                                        : undefined
                                }
                                role={onJumpToEvent ? 'button' : undefined}
                                tabIndex={onJumpToEvent ? 0 : undefined}
                            >
                                <span style={senderStyle}>{getSender(reply)}</span>
                                <p style={bodyStyle}>{renderEventBody(reply, fallbackBody)}</p>
                                <span style={metaStyle}>{getEventTimestamp(reply)}</span>
                            </article>
                        );
                    })
                )}
            </div>

            <div style={composerSlotStyle} data-testid="thread-panel-composer-slot">
                {renderComposer ? (
                    renderComposer(rootEventId)
                ) : (
                    <button
                        type="button"
                        data-testid="thread-panel-reply-fallback"
                        onClick={onReply ? () => onReply(rootEventId) : undefined}
                        disabled={!onReply}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--accent-primary, #1ABC9C)',
                            background: onReply
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--bg-input)',
                            color: onReply ? '#fff' : 'var(--text-secondary)',
                            cursor: onReply ? 'pointer' : 'not-allowed',
                        }}
                    >
                        Reply in thread
                    </button>
                )}
            </div>
        </section>
    );
}

export default ThreadPanel;
