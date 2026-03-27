/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { TimelineRenderingType } from "../../../../../../../../src/contexts/RoomContext";
import dispatcher from "../../../../../../../../src/dispatcher/dispatcher";
import { Action } from "../../../../../../../../src/dispatcher/actions";
import { editorRoomKey, editorStateKey } from "../../../../../../../../src/Editing";
import { endEditing } from "../../../../../../../../src/components/views/rooms/wysiwyg_composer/utils/editing";

describe("endEditing", () => {
    it("clears persisted edit state for the current timeline context", () => {
        const dispatchSpy = jest.spyOn(dispatcher, "dispatch");

        const roomKey = editorRoomKey("!room:server", TimelineRenderingType.Room);
        const roomEventId = "$event-room";
        const roomStateKey = editorStateKey(roomEventId);

        const threadKey = editorRoomKey("!room:server", TimelineRenderingType.Thread);
        const threadEventId = "$event-thread";
        const threadStateKey = editorStateKey(threadEventId);

        localStorage.setItem(roomKey, roomEventId);
        localStorage.setItem(roomStateKey, '{"serializedParts":[]}');

        localStorage.setItem(threadKey, threadEventId);
        localStorage.setItem(threadStateKey, '{"serializedParts":[{"text":"keep"}]}');

        endEditing({ timelineRenderingType: TimelineRenderingType.Room });

        expect(localStorage.getItem(roomKey)).toBeNull();
        expect(localStorage.getItem(roomStateKey)).toBeNull();

        expect(localStorage.getItem(threadKey)).toBe(threadEventId);
        expect(localStorage.getItem(threadStateKey)).not.toBeNull();

        expect(dispatchSpy).toHaveBeenNthCalledWith(1, {
            action: Action.EditEvent,
            event: null,
            timelineRenderingType: TimelineRenderingType.Room,
        });
        expect(dispatchSpy).toHaveBeenNthCalledWith(2, {
            action: Action.FocusSendMessageComposer,
            context: TimelineRenderingType.Room,
        });
    });
});
