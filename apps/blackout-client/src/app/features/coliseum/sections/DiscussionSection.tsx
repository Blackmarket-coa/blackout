import React, { useCallback } from 'react';
import type { ColiseumTopic } from '@blackout/core';
import { EmptyState } from '@blackout/ui/primitives';
import { ForumView } from '../../forum/ForumView';
import { RoomTimeline } from '../../room/RoomTimeline';
import { MessageComposer } from '../../room/MessageComposer';
import { useDenKind } from '../../canopy/denKind';
import { useDiscussionDen } from '../../canopy/useDiscussionDen';
import { linkColiseumTopicDen } from '../coliseumClient';
import * as ui from '../components/coliseumUi.css';
import * as css from '../TopicPage.css';

export interface DiscussionSectionProps {
    topic: ColiseumTopic;
    /** Called after a den is attached so the page can refresh the topic. */
    onLinked?: () => void;
}

/** The den body, dispatched on kind exactly as `CanopyDenSurface` does. */
function DenBody({ denRoomId }: { denRoomId: string }) {
    const kind = useDenKind(denRoomId);
    if (kind === 'forum') return <ForumView roomId={denRoomId} />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <RoomTimeline roomId={denRoomId} />
            </div>
            <MessageComposer roomId={denRoomId} />
        </div>
    );
}

/**
 * Free-form talk about a topic, in a canopy den.
 *
 * Deliberately *not* a bespoke comment list. It mounts the same components the
 * canopy server page mounts — `ForumView`, or `RoomTimeline` + `MessageComposer`
 * — so the composer, formatting, uploads, threads, moderation, redaction and
 * E2EE all behave identically here and everywhere else a user meets a
 * conversation. (`CanopyDenSurface` itself needs a canopy `Room`, which a
 * standalone topic does not have, so this composes the same layer beneath it.)
 *
 * The structured stance-arguments above are a different thing: they carry a
 * stance, citations, a Wilson vote score and a Polis consensus value, and the
 * whole ranking stack reads them. Those stay records. This is the conversation.
 */
export function DiscussionSection({ topic, onLinked }: DiscussionSectionProps) {
    const link = useCallback(
        async (denRoomId: string) => {
            const result = await linkColiseumTopicDen(topic.id, denRoomId);
            onLinked?.();
            return result.topic.discussionDenId ?? denRoomId;
        },
        [topic.id, onLinked]
    );

    const { denRoomId, creating, error, open } = useDiscussionDen({
        denRoomId: topic.discussionDenId,
        canopyId: topic.canopyId,
        name: topic.title.slice(0, 60),
        link,
    });

    if (denRoomId) {
        return (
            <div
                id="topic-discussion"
                className={css.section}
                data-testid="topic-discussion"
                style={{ height: 'min(70vh, 720px)', display: 'flex', minHeight: 0 }}
            >
                <DenBody denRoomId={denRoomId} />
            </div>
        );
    }

    return (
        <div id="topic-discussion" className={css.section} data-testid="topic-discussion">
            <div className={ui.feedColumn}>
                <EmptyState
                    title="No discussion yet"
                    description={
                        error ??
                        'Talk about this topic in its own channel — threads, replies, and uploads, same as any den.'
                    }
                    action={
                        <button
                            type="button"
                            className={ui.chipActive}
                            data-testid="topic-discussion-start"
                            disabled={creating}
                            onClick={() => void open()}
                        >
                            {creating ? 'Opening…' : 'Start the discussion'}
                        </button>
                    }
                />
            </div>
        </div>
    );
}

export default DiscussionSection;
