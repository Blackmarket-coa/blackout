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

interface MatrixWidgetContext {
    roomId: string;
    userId: string;
    displayName?: string;
}

interface Props {
    context: MatrixWidgetContext;
    tokenService?: TownhallTokenService;
}

export default function TownhallWidgetShell({ context, tokenService }: Props): JSX.Element {
    const [error, setError] = useState<string>();
    const [session, setSession] = useState<TownhallTokenResponse>();
    const [isConnecting, setIsConnecting] = useState(false);

    const service = useMemo(() => tokenService ?? new TownhallTokenService(), [tokenService]);

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
            {error && <p data-testid="blackout-townhall-error">{error}</p>}
        </section>
    );
}
