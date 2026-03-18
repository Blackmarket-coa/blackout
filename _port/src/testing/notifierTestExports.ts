/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import Notifier from "../Notifier";

export function displayPopupNotificationForTest(ev: MatrixEvent, room: Room): void {
    Notifier.displayPopupNotification(ev, room);
}

export function evaluateEventForTest(ev: MatrixEvent): void {
    Notifier.evaluateEvent(ev);
}
