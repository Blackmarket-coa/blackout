/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type {
    GovernanceLifecycleState,
    JurySelectionRecord,
    ProposalDocument,
} from "../../modules/governance/models/types";

const ORDERED_STATES: GovernanceLifecycleState[] = ["draft", "discuss", "amend", "close", "decide"];

const VALID_TRANSITIONS: Record<GovernanceLifecycleState, GovernanceLifecycleState[]> = {
    draft: ["discuss"],
    discuss: ["amend", "close"],
    amend: ["discuss", "close"],
    close: ["decide"],
    decide: [],
};

export class ProposalEngine {
    public create(
        proposal: Omit<ProposalDocument, "state" | "createdAt" | "updatedAt">,
        now: number = Date.now(),
    ): ProposalDocument {
        return {
            ...proposal,
            state: "draft",
            createdAt: now,
            updatedAt: now,
        };
    }

    public transition(
        proposal: ProposalDocument,
        nextState: GovernanceLifecycleState,
        now: number = Date.now(),
    ): ProposalDocument {
        if (!VALID_TRANSITIONS[proposal.state].includes(nextState)) {
            throw new Error(`Invalid proposal transition: ${proposal.state} -> ${nextState}`);
        }

        return {
            ...proposal,
            state: nextState,
            updatedAt: now,
        };
    }

    public amend(proposal: ProposalDocument, body: string, now: number = Date.now()): ProposalDocument {
        if (!["draft", "discuss", "amend"].includes(proposal.state)) {
            throw new Error(`Cannot amend proposal while in ${proposal.state} state`);
        }

        return {
            ...proposal,
            body,
            updatedAt: now,
            state: proposal.state === "draft" ? "discuss" : "amend",
        };
    }

    public attachJurySelection(
        proposal: ProposalDocument,
        jurySelection: JurySelectionRecord,
        now: number = Date.now(),
    ): ProposalDocument {
        return {
            ...proposal,
            jurySelection,
            updatedAt: now,
        };
    }
    public canVote(proposal: ProposalDocument): boolean {
        return proposal.state === "close";
    }

    public getStateOrder(state: GovernanceLifecycleState): number {
        return ORDERED_STATES.indexOf(state);
    }

    public toSummaryEvent(proposal: ProposalDocument): {
        type: "im.blackout.governance.proposal";
        content: ProposalDocument;
    } {
        return {
            type: "im.blackout.governance.proposal",
            content: proposal,
        };
    }
}
