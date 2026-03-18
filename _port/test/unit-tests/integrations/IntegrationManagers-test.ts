/*
Copyright 2024 New Vector Ltd.
Copyright 2024 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import { IntegrationManagers } from "../../../src/integrations/IntegrationManagers";
import { stubClient } from "../../test-utils";

describe("IntegrationManagers", () => {
    let client: MatrixClient;
    let intMgrs: IntegrationManagers;

    beforeEach(() => {
        client = stubClient();
        mocked(client).getAccountData.mockReturnValue({
            getContent: jest.fn().mockReturnValue({
                foo: {
                    id: "foo",
                    content: {
                        type: "m.integration_manager",
                        url: "http://foo/ui",
                        data: {
                            api_url: "http://foo/api",
                        },
                    },
                },
                bar: {
                    id: "bar",
                    content: {
                        type: "m.integration_manager",
                        url: "http://bar/ui",
                        data: {
                            api_url: "http://bar/api",
                        },
                    },
                },
            }),
        } as unknown as MatrixEvent);

        intMgrs = new IntegrationManagers();
        intMgrs.startWatching();
    });

    afterEach(() => {
        intMgrs.stopWatching();
    });

    describe("getOrderedManagers", () => {
        it("should return integration managers in alphabetical order", () => {
            const orderedManagers = intMgrs.getOrderedManagers();

            expect(orderedManagers[0].id).toBe("bar");
            expect(orderedManagers[1].id).toBe("foo");
        });
    });

    describe("setupHomeserverManagers", () => {
        it("clears stale homeserver scalar tokens before replacing managers", async () => {
            window.localStorage.setItem("mx_scalar_token_at_https://old.example/api", "stale");
            const managersAny = intMgrs as unknown as {
                managers: Array<{ kind: string; apiUrl: string }>;
                setupHomeserverManagers: (discoveryResponse: unknown) => Promise<void>;
            };
            managersAny.managers = [{ kind: "homeserver", apiUrl: "https://old.example/api" }];

            await managersAny.setupHomeserverManagers({
                "m.integrations": {
                    managers: [{ api_url: "https://new.example/api", ui_url: "https://new.example/ui" }],
                },
            });

            expect(window.localStorage.getItem("mx_scalar_token_at_https://old.example/api")).toBeNull();
        });
    });

});
