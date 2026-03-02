/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { TownhallTokenService } from "../../../src/services/townhall/TownhallTokenService";

describe("TownhallTokenService", () => {
    it("posts room and user context to token endpoint", async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                token: "jwt",
                livekitUrl: "wss://livekit.example.org",
                role: "listener",
                expiresAt: new Date().toISOString(),
                canPublish: false,
            }),
        }));

        const service = new TownhallTokenService({ endpoint: "/api/townhall/token", fetchImpl: fetchImpl as unknown as typeof fetch });

        await service.requestToken({ roomId: "!room:example.org", userId: "@alice:example.org" });

        expect(fetchImpl).toHaveBeenCalledWith(
            "/api/townhall/token",
            expect.objectContaining({ method: "POST" }),
        );
    });
});
