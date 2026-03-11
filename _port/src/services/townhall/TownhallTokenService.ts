/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type TownhallRole = "host" | "moderator" | "speaker" | "listener";

export interface TownhallTokenRequest {
    roomId: string;
    userId: string;
    displayName?: string;
}

export interface TownhallTokenResponse {
    token: string;
    livekitUrl: string;
    role: TownhallRole;
    expiresAt: string;
    canPublish: boolean;
}

export interface TownhallTokenServiceOptions {
    endpoint?: string;
    fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = "/api/townhall/token";

export class TownhallTokenService {
    private readonly endpoint: string;
    private readonly fetchImpl: typeof fetch;

    public constructor(options: TownhallTokenServiceOptions = {}) {
        this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    public async requestToken(request: TownhallTokenRequest): Promise<TownhallTokenResponse> {
        const response = await this.fetchImpl(this.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`Townhall token request failed with status ${response.status}`);
        }

        const data = (await response.json()) as TownhallTokenResponse;
        this.validateResponse(data);
        return data;
    }

    private validateResponse(data: TownhallTokenResponse): void {
        if (!data.token || !data.livekitUrl || !data.role || !data.expiresAt) {
            throw new Error("Townhall token response missing required fields");
        }
    }
}
