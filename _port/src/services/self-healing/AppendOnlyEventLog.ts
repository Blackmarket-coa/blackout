/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface SelfHealingEvent {
    eventId: string;
    payload: string;
    previousHash: string;
    contentHash: string;
    actorPublicKey: string;
    signature: string;
}

export type SignatureVerifier = (event: SelfHealingEvent) => Promise<boolean>;

export interface SelfHealingIngestResult {
    accepted: boolean;
    reason?: "INVALID_SIGNATURE" | "HASH_CHAIN_BREAK" | "DUPLICATE_EVENT";
}

function hashPayload(payload: string): string {
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
        hash ^= payload.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv32:${(hash >>> 0).toString(16)}`;
}

export class AppendOnlyEventLog {
    private readonly events: SelfHealingEvent[] = [];
    private readonly seen = new Set<string>();

    public constructor(private readonly verifySignature: SignatureVerifier) {}

    public get length(): number {
        return this.events.length;
    }

    public getHeadHash(): string {
        return this.events[this.events.length - 1]?.contentHash ?? "genesis";
    }

    public list(): readonly SelfHealingEvent[] {
        return this.events;
    }

    public async ingest(event: SelfHealingEvent): Promise<SelfHealingIngestResult> {
        if (this.seen.has(event.eventId)) {
            return { accepted: false, reason: "DUPLICATE_EVENT" };
        }

        const expectedPreviousHash = this.getHeadHash();
        if (event.previousHash !== expectedPreviousHash) {
            return { accepted: false, reason: "HASH_CHAIN_BREAK" };
        }

        if (event.contentHash !== hashPayload(event.payload)) {
            return { accepted: false, reason: "HASH_CHAIN_BREAK" };
        }

        const signatureValid = await this.verifySignature(event);
        if (!signatureValid) {
            return { accepted: false, reason: "INVALID_SIGNATURE" };
        }

        this.events.push(event);
        this.seen.add(event.eventId);

        return { accepted: true };
    }

    public rebuildState(): string {
        return this.events.map((event) => event.payload).join("\n");
    }

    public static computeContentHash(payload: string): string {
        return hashPayload(payload);
    }
}
