/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { TownhallTokenService } from "../../../src/services/townhall/TownhallTokenService";

describe("townhall 100-user load gate", () => {
    it("mints tokens for 100 concurrent listeners under 1 second in test harness", async () => {
        const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse((init?.body as string | undefined) ?? "{}");
            return {
                ok: true,
                json: async () => ({
                    token: `token-${body.userId}`,
                    livekitUrl: "wss://livekit.staging.blackout.local",
                    role: "listener",
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    canPublish: false,
                }),
            };
        });

        const service = new TownhallTokenService({
            endpoint: "/api/townhall/token",
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        const start = Date.now();
        const users = Array.from({ length: 100 }, (_, index) => index + 1);

        const results = await Promise.all(
            users.map((id) =>
                service.requestToken({
                    roomId: "!blackout-townhall-staging:local",
                    userId: `@load-${id}:blackout.local`,
                }),
            ),
        );

        const durationMs = Date.now() - start;

        expect(results).toHaveLength(100);
        expect(fetchImpl).toHaveBeenCalledTimes(100);
        expect(durationMs).toBeLessThan(1000);
    });
});
