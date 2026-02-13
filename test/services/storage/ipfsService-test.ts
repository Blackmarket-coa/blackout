/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { IpfsService } from "../../../src/services/storage/ipfsService";

describe("IpfsService", () => {
    it("reports unconfigured when no endpoints are set", () => {
        const service = new IpfsService();
        expect(service.isConfigured()).toBe(false);
    });

    it("runs API health checks", async () => {
        const service = new IpfsService(
            { apiBaseUrl: "https://ipfs.example.org" },
            jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch,
        );

        await expect(service.healthCheck()).resolves.toEqual({ ok: true });
    });

    it("uploads file content and returns CID metadata", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "bafy-test", Size: "123" }),
        });

        const service = new IpfsService(
            { apiBaseUrl: "https://ipfs.example.org" },
            fetchMock as unknown as typeof fetch,
        );
        const result = await service.upload(new Blob(["hello"], { type: "text/plain" }));

        expect(fetchMock).toHaveBeenCalled();
        expect(result).toEqual({
            cid: "bafy-test",
            size: 123,
            mimeType: "text/plain",
        });
    });

    it("downloads by CID through the configured gateway", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/octet-stream" },
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });

        const service = new IpfsService(
            { gatewayBaseUrl: "https://gateway.example.org" },
            fetchMock as unknown as typeof fetch,
        );
        const result = await service.download("bafy-data");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://gateway.example.org/ipfs/bafy-data",
            expect.objectContaining({ signal: expect.any(Object) }),
        );
        expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2, 3]));
        expect(result.contentType).toBe("application/octet-stream");
    });

    it("creates Matrix-storable CID references", () => {
        const service = new IpfsService({ enabled: true });
        const ref = service.toRoomCidReference("!room:example.org", "bafy-test", "file.txt", "@alice:example.org");
        expect(ref.roomId).toBe("!room:example.org");
        expect(ref.cid).toBe("bafy-test");
    });

    it("supports feature-flag disablement", () => {
        const service = new IpfsService({ enabled: false, gatewayBaseUrl: "https://gateway.example.org" });
        expect(service.isConfigured()).toBe(false);
        expect(service.isFeatureEnabled()).toBe(false);
    });
});
