/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useMemo, useState } from "react";

import {
    TownhallTokenService,
    type TownhallRole,
    type TownhallTokenResponse,
} from "../../../services/townhall/TownhallTokenService";
import {
    InMemoryTownhallModerationService,
    type TownhallAuditEvent,
    type TownhallModerationAction,
    type TownhallModerationService,
} from "../../../services/townhall/TownhallPolicyService";

interface MatrixWidgetContext {
    roomId: string;
    userId: string;
    displayName?: string;
}

interface Props {
    context: MatrixWidgetContext;
    tokenService?: TownhallTokenService;
    moderationService?: TownhallModerationService;
}

export default function TownhallWidgetShell({ context, tokenService, moderationService }: Props): React.JSX.Element {
    const [error, setError] = useState<string>();
    const [session, setSession] = useState<TownhallTokenResponse>();
    const [isConnecting, setIsConnecting] = useState(false);
    const [auditEvents, setAuditEvents] = useState<TownhallAuditEvent[]>([]);

    const service = useMemo(() => tokenService ?? new TownhallTokenService(), [tokenService]);
    const moderation = useMemo(
        () => moderationService ?? new InMemoryTownhallModerationService(),
        [moderationService],
    );

    const connect = async (): Promise<void> => {
        setError(undefined);
        setIsConnecting(true);

        try {
            const token = await service.requestToken(context);
            setSession(token);
        } catch (connectionError) {
            setError(connectionError instanceof Error ? connectionError.message : "Townhall connection failed");
        } finally {
            setIsConnecting(false);
        }
    };

    const role: TownhallRole = session?.role ?? "listener";
    const canModerate = role === "host" || role === "moderator";

    const applyModeration = async (action: TownhallModerationAction): Promise<void> => {
        const result = await moderation.applyAction({
            roomId: context.roomId,
            actor: context.userId,
            target: context.roomId,
            action,
            reason: "widget_control",
        });

        setAuditEvents((prev) => [result.auditEvent, ...prev]);
    };

    return (
        <section data-testid="blackout-townhall-widget-shell">
            <h2>Townhall SFU Widget (MVP)</h2>
            <p data-testid="blackout-townhall-context">
                Room: {context.roomId} · User: {context.userId}
            </p>
            <button type="button" onClick={connect} disabled={isConnecting} data-testid="blackout-townhall-connect">
                {isConnecting ? "Connecting…" : "Connect to townhall"}
            </button>
            <p data-testid="blackout-townhall-role">Role: {role}</p>
            <p data-testid="blackout-townhall-publish">
                Publishing: {session?.canPublish ? "enabled" : "listener-only"}
            </p>
            {session && <p data-testid="blackout-townhall-endpoint">LiveKit: {session.livekitUrl}</p>}
            {canModerate && (
                <div data-testid="blackout-townhall-moderation-controls">
                    <button type="button" onClick={() => void applyModeration("mute_all")}>
                        Mute all
                    </button>
                    <button type="button" onClick={() => void applyModeration("publish_lock")}>
                        Lock publishing
                    </button>
                    <button type="button" onClick={() => void applyModeration("kick")}>
                        Kick participant
                    </button>
                </div>
            )}
            {auditEvents.length > 0 && (
                <ul data-testid="blackout-townhall-audit-log">
                    {auditEvents.map((event, index) => (
                        <li key={`${event.ts}-${index}`}>{`${event.action} by ${event.actor}`}</li>
                    ))}
                </ul>
            )}
            {error && <p data-testid="blackout-townhall-error">{error}</p>}
        </section>
    );
}
