/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type {
    GovernanceAuditEntry,
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

const GOVERNANCE_SCHEMA_VERSION = 2;

export interface GovernancePermissionContext {
    actorUserId: string;
    isRoomMember: boolean;
    powerLevel: number;
}

function makeAuditEntry(entry: Omit<GovernanceAuditEntry, "id">): GovernanceAuditEntry {
    return {
        ...entry,
        id: `audit-${entry.at}-${Math.random().toString(36).slice(2, 8)}`,
    };
}

function assertCanGovern(ctx: GovernancePermissionContext): void {
    if (!ctx.isRoomMember) {
        throw new Error("Actor is not a room member");
    }

    if (ctx.powerLevel < 0) {
        throw new Error("Actor power level is invalid");
    }
}

export class ProposalEngine {
    public create(
        proposal: Omit<
            ProposalDocument,
            "schemaVersion" | "state" | "amendments" | "auditTimeline" | "createdAt" | "updatedAt"
        >,
        permissionContext: GovernancePermissionContext,
        now: number = Date.now(),
    ): ProposalDocument {
        assertCanGovern(permissionContext);

        return {
            ...proposal,
            schemaVersion: GOVERNANCE_SCHEMA_VERSION,
            state: "draft",
            amendments: [],
            auditTimeline: [
                makeAuditEntry({
                    actorUserId: permissionContext.actorUserId,
                    action: "create",
                    at: now,
                    detail: "Proposal created",
                }),
            ],
            createdAt: now,
            updatedAt: now,
        };
    }

    public transition(
        proposal: ProposalDocument,
        nextState: GovernanceLifecycleState,
        permissionContext: GovernancePermissionContext,
        now: number = Date.now(),
    ): ProposalDocument {
        assertCanGovern(permissionContext);
        if (!VALID_TRANSITIONS[proposal.state].includes(nextState)) {
            throw new Error(`Invalid proposal transition: ${proposal.state} -> ${nextState}`);
        }

        return {
            ...proposal,
            state: nextState,
            updatedAt: now,
            auditTimeline: [
                ...proposal.auditTimeline,
                makeAuditEntry({
                    actorUserId: permissionContext.actorUserId,
                    action: "transition",
                    at: now,
                    detail: `${proposal.state} -> ${nextState}`,
                }),
            ],
        };
    }

    public amend(
        proposal: ProposalDocument,
        body: string,
        permissionContext: GovernancePermissionContext,
        now: number = Date.now(),
    ): ProposalDocument {
        assertCanGovern(permissionContext);
        if (!["draft", "discuss", "amend"].includes(proposal.state)) {
            throw new Error(`Cannot amend proposal while in ${proposal.state} state`);
        }

        const amendment = {
            id: `amendment-${now}`,
            actorUserId: permissionContext.actorUserId,
            previousBody: proposal.body,
            nextBody: body,
            createdAt: now,
        };

        return {
            ...proposal,
            body,
            updatedAt: now,
            state: proposal.state === "draft" ? "discuss" : "amend",
            amendments: [...proposal.amendments, amendment],
            auditTimeline: [
                ...proposal.auditTimeline,
                makeAuditEntry({
                    actorUserId: permissionContext.actorUserId,
                    action: "amend",
                    at: now,
                    detail: amendment.id,
                }),
            ],
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
            auditTimeline: [
                ...proposal.auditTimeline,
                makeAuditEntry({
                    actorUserId: proposal.authorUserId,
                    action: "jury_select",
                    at: now,
                }),
            ],
        };
    }

    public migrate(input: ProposalDocument): ProposalDocument {
        if ((input.schemaVersion ?? 1) >= GOVERNANCE_SCHEMA_VERSION) {
            return input;
        }

        return {
            ...input,
            schemaVersion: GOVERNANCE_SCHEMA_VERSION,
            amendments: input.amendments ?? [],
            auditTimeline: input.auditTimeline ?? [],
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
