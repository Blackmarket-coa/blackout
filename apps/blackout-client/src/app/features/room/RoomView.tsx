import React, { useCallback, useRef } from 'react';
import { Box, Text, config } from 'folds';
import { useAtomValue } from 'jotai';
import { EventType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useEditor } from '../../components/editor';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomTimeline } from './RoomTimeline';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTombstone } from './RoomTombstone';
import { RoomInput } from './RoomInput';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { Page } from '../../components/page';
import { RoomViewHeader } from './RoomViewHeader';
import { useKeyDown } from '../../hooks/useKeyDown';
import { editableActiveElement } from '../../utils/dom';
import { settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { roomViewBaselineControlLayout, roomViewLayoutRhythm } from './roomViewLayoutContract';
import { composerCommandStatusAtom } from '../../state/bmc-composer';

const FN_KEYS_REGEX = /^F\d+$/;
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
    const { code } = evt;
    if (evt.metaKey || evt.altKey || evt.ctrlKey) {
        return false;
    }

    // do not focus on F keys
    if (FN_KEYS_REGEX.test(code)) return false;

    // do not focus on numlock/scroll lock
    if (
        code.startsWith('OS') ||
        code.startsWith('Meta') ||
        code.startsWith('Shift') ||
        code.startsWith('Alt') ||
        code.startsWith('Control') ||
        code.startsWith('Arrow') ||
        code.startsWith('Page') ||
        code.startsWith('End') ||
        code.startsWith('Home') ||
        code === 'Tab' ||
        code === 'Space' ||
        code === 'Enter' ||
        code === 'NumLock' ||
        code === 'ScrollLock'
    ) {
        return false;
    }

    return true;
};

export function RoomView({ room, eventId }: { room: Room; eventId?: string }) {
    const roomInputRef = useRef<HTMLDivElement>(null);
    const roomViewRef = useRef<HTMLDivElement>(null);

    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');

    const { roomId } = room;
    const editor = useEditor();

    const mx = useMatrixClient();

    const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());
    const composerStatusMessage = useAtomValue(composerCommandStatusAtom);

    useKeyDown(
        window,
        useCallback(
            (evt) => {
                if (editableActiveElement()) return;
                const portalContainer = document.getElementById('portalContainer');
                if (portalContainer && portalContainer.children.length > 0) {
                    return;
                }
                if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
                    ReactEditor.focus(editor);
                }
            },
            [editor]
        )
    );

    return (
        <Page ref={roomViewRef}>
            <RoomViewHeader />
            <Box
                grow="Yes"
                direction="Column"
                data-control-region={roomViewBaselineControlLayout.timelineRegion}
            >
                <RoomTimeline
                    key={roomId}
                    roomId={roomId}
                    jumpToEventId={eventId}
                />
                <RoomViewTyping room={room} />
            </Box>
            <Box
                shrink="No"
                direction="Column"
                data-control-region={roomViewBaselineControlLayout.composerRegion}
            >
                <div
                    style={{
                        padding: `0 ${roomViewLayoutRhythm.composerHorizontalPaddingPx}px`,
                        minHeight: roomViewLayoutRhythm.minTouchTargetPx,
                    }}
                >
                    {composerStatusMessage ? (
                        <Text
                            size="T200"
                            style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                            aria-live="polite"
                        >
                            {composerStatusMessage}
                        </Text>
                    ) : null}
                    {tombstoneEvent ? (
                        <RoomTombstone
                            roomId={roomId}
                            body={tombstoneEvent.getContent().body}
                            replacementRoomId={tombstoneEvent.getContent().replacement_room}
                        />
                    ) : (
                        <>
                            {canMessage && (
                                <RoomInput
                                    room={room}
                                    editor={editor}
                                    roomId={roomId}
                                    fileDropContainerRef={roomViewRef}
                                    ref={roomInputRef}
                                />
                            )}
                            {!canMessage && (
                                <RoomInputPlaceholder
                                    style={{ padding: config.space.S200 }}
                                    alignItems="Center"
                                    justifyContent="Center"
                                >
                                    <Text align="Center">
                                        You do not have permission to post in this room
                                    </Text>
                                </RoomInputPlaceholder>
                            )}
                        </>
                    )}
                </div>
                {hideActivity ? (
                    <RoomViewFollowingPlaceholder />
                ) : (
                    <RoomViewFollowing room={room} />
                )}
            </Box>
        </Page>
    );
}
