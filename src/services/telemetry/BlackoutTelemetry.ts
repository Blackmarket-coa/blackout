/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface BlackoutTelemetryEvent {
    name: string;
    at: number;
    properties?: Record<string, unknown>;
}

const events: BlackoutTelemetryEvent[] = [];

export function trackBlackoutEvent(name: string, properties?: Record<string, unknown>): void {
    events.push({ name, at: Date.now(), properties });
}

export function getBlackoutTelemetryEvents(): BlackoutTelemetryEvent[] {
    return [...events];
}

export function clearBlackoutTelemetryEvents(): void {
    events.length = 0;
}
