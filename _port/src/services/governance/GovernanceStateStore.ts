/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { open, snapshot } from "../crdt/documentManager";
import type { ProposalDocument, VoteDocument } from "../../modules/governance/models/types";

interface GovernanceRoomEvent {
    roomId: string;
    type: "im.blackout.governance.proposal" | "im.blackout.governance.vote";
    stateKey: string;
    content: Record<string, unknown>;
    ts: number;
}

export class GovernanceStateStore {
    private readonly roomEvents = new Map<string, GovernanceRoomEvent[]>();

    public async persistProposal(proposal: ProposalDocument): Promise<void> {
        const yDoc = await open(proposal.roomId, "proposal", proposal.id);
        yDoc.getMap("proposal").set("document", JSON.stringify(proposal));
        this.appendRoomEvent(proposal.roomId, {
            roomId: proposal.roomId,
            type: "im.blackout.governance.proposal",
            stateKey: proposal.id,
            content: proposal as unknown as Record<string, unknown>,
            ts: Date.now(),
        });
    }

    public async loadProposal(roomId: string, proposalId: string): Promise<ProposalDocument | undefined> {
        const yDoc = await open(roomId, "proposal", proposalId);
        const raw = yDoc.getMap("proposal").get("document");
        if (typeof raw !== "string") {
            return undefined;
        }

        return JSON.parse(raw) as ProposalDocument;
    }

    public async persistVote(vote: VoteDocument): Promise<void> {
        const yDoc = await open(vote.roomId, "vote", vote.proposalId);
        yDoc.getMap("vote").set("document", JSON.stringify(vote));
        this.appendRoomEvent(vote.roomId, {
            roomId: vote.roomId,
            type: "im.blackout.governance.vote",
            stateKey: vote.proposalId,
            content: vote as unknown as Record<string, unknown>,
            ts: Date.now(),
        });
    }

    public async loadVote(roomId: string, proposalId: string): Promise<VoteDocument | undefined> {
        const yDoc = await open(roomId, "vote", proposalId);
        const raw = yDoc.getMap("vote").get("document");
        if (typeof raw !== "string") {
            return undefined;
        }

        return JSON.parse(raw) as VoteDocument;
    }

    public getProposalSnapshot(roomId: string, proposalId: string): Uint8Array | undefined {
        return snapshot(roomId, "proposal", proposalId);
    }

    public getVoteSnapshot(roomId: string, proposalId: string): Uint8Array | undefined {
        return snapshot(roomId, "vote", proposalId);
    }

    public listRoomEvents(roomId: string): GovernanceRoomEvent[] {
        return [...(this.roomEvents.get(roomId) ?? [])];
    }

    private appendRoomEvent(roomId: string, event: GovernanceRoomEvent): void {
        const list = this.roomEvents.get(roomId) ?? [];
        list.push(event);
        this.roomEvents.set(roomId, list);
    }
}
