/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EventStatus, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { type IRoomState } from "../../../../structures/RoomView";
import dis from "../../../../../dispatcher/dispatcher";
import { Action } from "../../../../../dispatcher/actions";
import type EditorStateTransfer from "../../../../../utils/EditorStateTransfer";
import { editorStateKey } from "../../../../../Editing";

export function endEditing(roomContext: Pick<IRoomState, "timelineRenderingType">): void {
    // Clear any persisted edit draft state for this timeline context.
    const storage = globalThis.localStorage;
    if (storage) {
        const roomKeySuffix = `_${roomContext.timelineRenderingType}`;
        const roomKeysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith("mx_edit_room_") && key.endsWith(roomKeySuffix)) {
                roomKeysToRemove.push(key);
            }
        }

        for (const roomKey of roomKeysToRemove) {
            const eventId = storage.getItem(roomKey);
            if (eventId) {
                storage.removeItem(editorStateKey(eventId));
            }
            storage.removeItem(roomKey);
        }
    }

    // close the event editing and focus composer
    dis.dispatch({
        action: Action.EditEvent,
        event: null,
        timelineRenderingType: roomContext.timelineRenderingType,
    });
    dis.dispatch({
        action: Action.FocusSendMessageComposer,
        context: roomContext.timelineRenderingType,
    });
}

export function cancelPreviousPendingEdit(mxClient: MatrixClient, editorStateTransfer: EditorStateTransfer): void {
    const originalEvent = editorStateTransfer.getEvent();
    const previousEdit = originalEvent.replacingEvent();
    if (previousEdit && (previousEdit.status === EventStatus.QUEUED || previousEdit.status === EventStatus.NOT_SENT)) {
        mxClient.cancelPendingEvent(previousEdit);
    }
}
