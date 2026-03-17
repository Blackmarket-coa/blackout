/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { mkEvent } from "../../test-utils/test-utils";
import {
    InMemoryTownhallModerationService,
    parseTownhallPolicyStateEvent,
    resolveEffectiveTownhallRole,
} from "../../../src/services/townhall/TownhallPolicyService";

describe("TownhallPolicyService", () => {
    it("resolves role precedence deterministically", () => {
        const role = resolveEffectiveTownhallRole([
            { role: "listener", actor: "@a:hs", reason: "default", updatedAt: 1 },
            { role: "moderator", actor: "@b:hs", reason: "elevated", updatedAt: 2 },
        ]);

        expect(role).toBe("moderator");
    });

    it("parses valid policy state events", () => {
        const event = mkEvent({
            type: "org.blackout.townhall.policy",
            room: "!room:hs",
            user: "@mod:hs",
            content: {
                publisherCap: 8,
                publishLock: false,
                sessionId: "session-1",
                agendaId: "agenda-1",
            },
        });

        expect(parseTownhallPolicyStateEvent(event)).toEqual({
            publisherCap: 8,
            publishLock: false,
            sessionId: "session-1",
            agendaId: "agenda-1",
        });
    });

    it("rejects malformed policy state event payloads", () => {
        const event = mkEvent({
            type: "org.blackout.townhall.policy",
            room: "!room:hs",
            user: "@mod:hs",
            content: {
                publisherCap: "8",
                publishLock: false,
                sessionId: "session-1",
                agendaId: "agenda-1",
            },
        });

        expect(parseTownhallPolicyStateEvent(event)).toBeNull();
    });

    it("records moderation actions as audit events", async () => {
        const service = new InMemoryTownhallModerationService();

        const result = await service.applyAction({
            roomId: "!room:hs",
            actor: "@mod:hs",
            target: "@speaker:hs",
            action: "mute_all",
            reason: "coordinated interruption",
        });

        expect(result.success).toBe(true);
        expect(service.getAuditLog()).toHaveLength(1);
        expect(service.getAuditLog()[0]).toMatchObject({
            actor: "@mod:hs",
            target: "@speaker:hs",
            action: "mute_all",
        });
    });
});
