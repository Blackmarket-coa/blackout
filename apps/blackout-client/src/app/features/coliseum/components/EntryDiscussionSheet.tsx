import React, { useCallback } from 'react';
import type { ChallengeEntry } from '@blackout/core';
import { EmptyState, Sheet } from '@blackout/ui/primitives';
import { ForumView } from '../../forum/ForumView';
import { RoomTimeline } from '../../room/RoomTimeline';
import { MessageComposer } from '../../room/MessageComposer';
import { useDenKind } from '../../canopy/denKind';
import { useDiscussionDen } from '../../canopy/useDiscussionDen';
import { linkChallengeEntryDen } from '../challengesClient';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';
import * as ui from './coliseumUi.css';

/** The den body, dispatched on kind exactly as the topic discussion does. */
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

export interface EntryDiscussionSheetProps {
    entry: ChallengeEntry;
    onClose: () => void;
    /** Called after a den is attached so the caller can refresh its entries. */
    onLinked?: () => void;
}

/**
 * Talk about a challenge entry, in a canopy den.
 *
 * Challenge entries were the last Coliseum surface holding user prose with
 * nowhere to discuss it — no comment list, no thread, no den; voting was the
 * only interaction. Rather than growing a comment store here, this mounts the
 * same components every other conversation in Blackout uses.
 *
 * A challenge has no canopy of its own, so the den is unparented — the same
 * path a standalone topic takes. No global "Coliseum canopy" is invented to
 * hold them.
 *
 * `entry` is required rather than nullable, so callers mount this only while
 * the sheet is open. That is load-bearing: `useDiscussionDen` remembers the den
 * it just created, and a single instance kept alive across entries would offer
 * the previous entry's discussion to the next one.
 */
export function EntryDiscussionSheet({ entry, onClose, onLinked }: EntryDiscussionSheetProps) {
    const link = useCallback(
        async (denRoomId: string) => {
            const result = await linkChallengeEntryDen(entry.id, denRoomId);
            onLinked?.();
            return result.entry.discussionDenId ?? denRoomId;
        },
        [entry, onLinked]
    );

    const { denRoomId, creating, error, open } = useDiscussionDen({
        denRoomId: entry.discussionDenId,
        canopyId: null,
        name: entry.title.slice(0, 60),
        link,
    });

    return (
        <Sheet open onClose={onClose} title={entry.title} className={coliseumSheetTheme}>
            {denRoomId ? (
                <div
                    style={{ height: 'min(70vh, 720px)', display: 'flex', minHeight: 0 }}
                    data-testid="coliseum-entry-discussion"
                >
                    <DenBody denRoomId={denRoomId} />
                </div>
            ) : (
                <div data-testid="coliseum-entry-discussion">
                    <EmptyState
                        title="No discussion yet"
                        description={
                            error ??
                            'Talk about this entry in its own channel — threads, replies and uploads, same as any den.'
                        }
                        action={
                            <button
                                type="button"
                                className={ui.chipActive}
                                disabled={creating}
                                data-testid="coliseum-entry-discussion-start"
                                onClick={() => void open()}
                            >
                                {creating ? 'Opening…' : 'Start the discussion'}
                            </button>
                        }
                    />
                </div>
            )}
        </Sheet>
    );
}

export default EntryDiscussionSheet;
