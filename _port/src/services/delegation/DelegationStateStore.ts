/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { open, snapshot } from "../crdt/documentManager";

export interface DelegationStateEvent {
    roomId: string;
    topic: string;
    content: Record<string, unknown>;
    ts: number;
}

export class DelegationStateStore {
    private readonly events = new Map<string, DelegationStateEvent[]>();

    public async persist(roomId: string, topic: string, delegationsByUserId: Record<string, string>): Promise<void> {
        const yDoc = await open(roomId, "delegation", topic);
        yDoc.getMap("delegation").set("document", JSON.stringify({ schemaVersion: 1, topic, delegationsByUserId }));
        const list = this.events.get(roomId) ?? [];
        list.push({ roomId, topic, content: { delegationsByUserId }, ts: Date.now() });
        this.events.set(roomId, list);
    }

    public async load(roomId: string, topic: string): Promise<Record<string, string>> {
        const yDoc = await open(roomId, "delegation", topic);
        const raw = yDoc.getMap("delegation").get("document");
        if (typeof raw !== "string") {
            return {};
        }

        return (JSON.parse(raw) as { delegationsByUserId?: Record<string, string> }).delegationsByUserId ?? {};
    }

    public getSnapshot(roomId: string, topic: string): Uint8Array | undefined {
        return snapshot(roomId, "delegation", topic);
    }

    public listEvents(roomId: string): DelegationStateEvent[] {
        return [...(this.events.get(roomId) ?? [])];
    }
}
