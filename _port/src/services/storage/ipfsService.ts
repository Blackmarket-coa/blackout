/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

interface IpfsServiceConfig {
    enabled?: boolean;
    apiBaseUrl?: string;
    gatewayBaseUrl?: string;
    healthPath?: string;
    addPath?: string;
    timeoutMs?: number;
}

interface IpfsUploadResult {
    cid: string;
    size: number;
    mimeType?: string;
}

interface IpfsCidReference {
    roomId: string;
    cid: string;
    name?: string;
    uploadedByUserId?: string;
    uploadedAt: number;
}
interface IpfsDownloadResult {
    cid: string;
    data: ArrayBuffer;
    contentType?: string;
}

const DEFAULT_HEALTH_PATH = "/api/v0/version";
const DEFAULT_ADD_PATH = "/api/v0/add";
const DEFAULT_TIMEOUT_MS = 10_000;

export class IpfsService {
    public constructor(
        private readonly config: IpfsServiceConfig = {},
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    public isConfigured(): boolean {
        return Boolean(this.config.enabled !== false && (this.config.apiBaseUrl || this.config.gatewayBaseUrl));
    }

    public isFeatureEnabled(): boolean {
        return this.config.enabled !== false;
    }

    public async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
        if (!this.config.apiBaseUrl) {
            return { ok: false, detail: "IPFS API base URL is not configured" };
        }

        try {
            const response = await this.fetchWithTimeout(
                this.buildUrl(this.config.apiBaseUrl, this.config.healthPath ?? DEFAULT_HEALTH_PATH),
            );
            if (!response.ok) {
                return { ok: false, detail: `IPFS API health check failed with status ${response.status}` };
            }

            return { ok: true };
        } catch (error) {
            return { ok: false, detail: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    public async upload(content: Blob): Promise<IpfsUploadResult> {
        if (!this.config.apiBaseUrl) {
            throw new Error("IPFS API base URL is not configured");
        }

        const body = new FormData();
        body.append("file", content);

        const response = await this.fetchWithTimeout(
            this.buildUrl(this.config.apiBaseUrl, this.config.addPath ?? DEFAULT_ADD_PATH),
            {
                method: "POST",
                body,
            },
        );

        if (!response.ok) {
            throw new Error(`IPFS upload failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { Hash?: string; Name?: string; Size?: string };
        if (!payload.Hash) {
            throw new Error("IPFS upload response missing CID hash");
        }

        return {
            cid: payload.Hash,
            size: Number(payload.Size ?? content.size),
            mimeType: content.type || undefined,
        };
    }

    public async download(cid: string): Promise<IpfsDownloadResult> {
        const baseUrl = this.config.gatewayBaseUrl ?? this.config.apiBaseUrl;
        if (!baseUrl) {
            throw new Error("IPFS gateway or API base URL is not configured");
        }

        const response = await this.fetchWithTimeout(this.buildUrl(baseUrl, `/ipfs/${cid}`));
        if (!response.ok) {
            throw new Error(`IPFS download failed with status ${response.status}`);
        }

        return {
            cid,
            data: await response.arrayBuffer(),
            contentType: response.headers.get("content-type") ?? undefined,
        };
    }

    public toRoomCidReference(roomId: string, cid: string, name?: string, uploadedByUserId?: string): IpfsCidReference {
        return { roomId, cid, name, uploadedByUserId, uploadedAt: Date.now() };
    }

    private buildUrl(baseUrl: string, path: string): string {
        return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    }

    private async fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        try {
            return await this.fetchImpl(input, {
                ...init,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }
    }
}

export type { IpfsCidReference, IpfsDownloadResult, IpfsServiceConfig, IpfsUploadResult };
