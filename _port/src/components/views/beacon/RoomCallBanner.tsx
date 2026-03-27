/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { VideoCallSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../languageHandler";
import AccessibleButton, { type ButtonEvent } from "../elements/AccessibleButton";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { Action } from "../../../dispatcher/actions";
import { ConnectionState, type ElementCall } from "../../../models/Call";
import { useCall } from "../../../hooks/useCall";
import { useEventEmitterState } from "../../../hooks/useEventEmitter";
import { OwnBeaconStore, OwnBeaconStoreEvent } from "../../../stores/OwnBeaconStore";
import { SessionDuration } from "../voip/CallDuration";
import { useScopedRoomContext } from "../../../contexts/ScopedRoomContext";

interface RoomCallBannerProps {
    roomId: Room["roomId"];
    call: ElementCall;
}

const RoomCallBannerInner: React.FC<RoomCallBannerProps> = ({ roomId, call }) => {
    const connect = useCallback(
        (ev: ButtonEvent) => {
            ev.preventDefault();
            defaultDispatcher.dispatch<ViewRoomPayload>({
                action: Action.ViewRoom,
                room_id: roomId,
                view_call: true,
                skipLobby: ("shiftKey" in ev && ev.shiftKey) || undefined,
                metricsTrigger: undefined,
            });
        },
        [roomId],
    );

    return (
        <div className="mx_RoomCallBanner">
            <div className="mx_RoomCallBanner_text">
                <span className="mx_RoomCallBanner_label">
                    <VideoCallSolidIcon />
                    {_t("voip|video_call")}
                </span>
                <SessionDuration session={call.session} />
            </div>

            <AccessibleButton onClick={connect} kind="primary" element="button" disabled={false}>
                {_t("action|join")}
            </AccessibleButton>
        </div>
    );
};

interface Props {
    roomId: Room["roomId"];
}

const RoomCallBanner: React.FC<Props> = ({ roomId }) => {
    const call = useCall(roomId);
    const { roomViewStore } = useScopedRoomContext("roomViewStore");
    // this section is to check if we have a live location share. If so, we dont show the call banner
    const isMonitoringLiveLocation = useEventEmitterState(
        OwnBeaconStore.instance,
        OwnBeaconStoreEvent.MonitoringLivePosition,
        () => OwnBeaconStore.instance.isMonitoringLiveLocation,
    );

    const liveBeaconIds = useEventEmitterState(OwnBeaconStore.instance, OwnBeaconStoreEvent.LivenessChange, () =>
        OwnBeaconStore.instance.getLiveBeaconIds(roomId),
    );

    if (isMonitoringLiveLocation && liveBeaconIds.length) {
        return null;
    }

    // Check if the call is already showing. No banner is needed in this case.
    if (roomViewStore.isViewingCall()) {
        return null;
    }

    // Split into outer/inner to avoid watching various parts if there is no call
    // No banner if the call is connected (or connecting/disconnecting)
    if (call !== null && call.connectionState === ConnectionState.Disconnected) {
        return <RoomCallBannerInner call={call as ElementCall} roomId={roomId} />;
    }

    return null;
};

export default RoomCallBanner;
