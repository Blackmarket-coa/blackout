/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen, waitFor } from "jest-matrix-react";

import TownhallWidgetShell from "../../../../src/modules/townhall/components/TownhallWidgetShell";
import type { TownhallTokenService } from "../../../../src/services/townhall/TownhallTokenService";

describe("TownhallWidgetShell", () => {
    const context = {
        roomId: "!room:example.org",
        userId: "@alice:example.org",
    };

    it("requests a token and renders role state", async () => {
        const tokenService = {
            requestToken: jest.fn(async () => ({
                token: "signed-token",
                livekitUrl: "wss://livekit.example.org",
                role: "speaker",
                canPublish: true,
                expiresAt: new Date().toISOString(),
            })),
        } as unknown as TownhallTokenService;

        render(<TownhallWidgetShell context={context} tokenService={tokenService} />);

        fireEvent.click(screen.getByTestId("blackout-townhall-connect"));

        await waitFor(() => {
            expect(screen.getByTestId("blackout-townhall-role")).toHaveTextContent("Role: speaker");
        });
        expect(screen.getByTestId("blackout-townhall-publish")).toHaveTextContent("Publishing: enabled");
    });

    it("surfaces token service errors", async () => {
        const tokenService = {
            requestToken: jest.fn(async () => {
                throw new Error("forbidden");
            }),
        } as unknown as TownhallTokenService;

        render(<TownhallWidgetShell context={context} tokenService={tokenService} />);

        fireEvent.click(screen.getByTestId("blackout-townhall-connect"));

        await waitFor(() => {
            expect(screen.getByTestId("blackout-townhall-error")).toHaveTextContent("forbidden");
        });
    });
});
