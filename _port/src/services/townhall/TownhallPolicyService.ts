/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

export type TownhallRole = "host" | "moderator" | "speaker" | "listener";

export interface TownhallPolicyState {
    publisherCap: number;
    publishLock: boolean;
    sessionId: string;
    agendaId: string;
}

export interface TownhallRoleState {
    role: TownhallRole;
    actor: string;
    reason: string;
    updatedAt: number;
}

export type TownhallModerationAction = "mute_all" | "demote" | "remove_stream" | "kick" | "publish_lock";

export interface TownhallAuditEvent {
    actor: string;
    target: string;
    action: TownhallModerationAction;
    reason: string;
    ts: number;
}

export interface TownhallModerationActionRequest {
    roomId: string;
    actor: string;
    target: string;
    action: TownhallModerationAction;
    reason: string;
}

export interface TownhallModerationResult {
    success: boolean;
    auditEvent: TownhallAuditEvent;
}

export interface TownhallModerationService {
    applyAction(request: TownhallModerationActionRequest): Promise<TownhallModerationResult>;
}

export class InMemoryTownhallModerationService implements TownhallModerationService {
    private readonly auditLog: TownhallAuditEvent[] = [];

    public async applyAction(request: TownhallModerationActionRequest): Promise<TownhallModerationResult> {
        const auditEvent: TownhallAuditEvent = {
            actor: request.actor,
            target: request.target,
            action: request.action,
            reason: request.reason,
            ts: Date.now(),
        };
        this.auditLog.push(auditEvent);

        return {
            success: true,
            auditEvent,
        };
    }

    public getAuditLog(): readonly TownhallAuditEvent[] {
        return this.auditLog;
    }
}

export function resolveEffectiveTownhallRole(roleStates: TownhallRoleState[]): TownhallRole {
    const priority: TownhallRole[] = ["host", "moderator", "speaker", "listener"];
    const found = roleStates
        .map((state) => state.role)
        .sort((a, b) => priority.indexOf(a) - priority.indexOf(b))[0];
    return found ?? "listener";
}

export function parseTownhallPolicyStateEvent(event: MatrixEvent): TownhallPolicyState | null {
    const content = event.getContent<Record<string, unknown>>();
    if (
        typeof content.publisherCap !== "number" ||
        typeof content.publishLock !== "boolean" ||
        typeof content.sessionId !== "string" ||
        typeof content.agendaId !== "string"
    ) {
        return null;
    }

    return {
        publisherCap: content.publisherCap,
        publishLock: content.publishLock,
        sessionId: content.sessionId,
        agendaId: content.agendaId,
    };
}
