/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useMemo, useState } from "react";

import { ProposalEngine } from "../../../services/governance/ProposalEngine";
import { VotingEngine, type Ballot } from "../../../services/governance/VotingEngine";
import type { ProposalDocument, VoteDocument } from "../models/types";
import ProposalComposer from "./ProposalComposer";
import ProposalDetail from "./ProposalDetail";
import ProposalList from "./ProposalList";
import DelegationAttestationsPanel from "./DelegationAttestationsPanel";

const ROOM_ID = "!blackout-governance:local";
const CURRENT_USER_ID = "@me:blackout.local";

const proposalEngine = new ProposalEngine();
const votingEngine = new VotingEngine();

const NEXT_STATES = {
    draft: "discuss",
    discuss: "amend",
    amend: "close",
    close: "decide",
    decide: undefined,
} as const;

export default function GovernanceHome(): React.JSX.Element {
    const [proposals, setProposals] = useState<ProposalDocument[]>([]);
    const [votesByProposalId, setVotesByProposalId] = useState<Record<string, VoteDocument>>({});
    const [selectedProposalId, setSelectedProposalId] = useState<string>();

    const selectedProposal = useMemo(
        () => proposals.find((proposal) => proposal.id === selectedProposalId),
        [proposals, selectedProposalId],
    );

    const selectedVote = selectedProposal ? votesByProposalId[selectedProposal.id] : undefined;

    const handleCreate = ({ title, body }: { title: string; body: string }): void => {
        const proposal = proposalEngine.create({
            id: `proposal-${Date.now()}`,
            roomId: ROOM_ID,
            title,
            body,
            authorUserId: CURRENT_USER_ID,
        });

        setProposals((current) => [proposal, ...current]);
        setSelectedProposalId(proposal.id);
    };

    const handleAdvanceState = (): void => {
        if (!selectedProposal) {
            return;
        }

        const nextState = NEXT_STATES[selectedProposal.state];
        if (!nextState) {
            return;
        }

        const transitioned = proposalEngine.transition(selectedProposal, nextState);
        setProposals((current) =>
            current.map((proposal) => (proposal.id === transitioned.id ? transitioned : proposal)),
        );
    };

    const handleStartVote = (): void => {
        if (!selectedProposal) {
            return;
        }

        setVotesByProposalId((current) => ({
            ...current,
            [selectedProposal.id]: votingEngine.open(selectedProposal.id, selectedProposal.roomId),
        }));
    };

    const handleCastVote = (ballot: Ballot): void => {
        if (!selectedProposal) {
            return;
        }

        const vote = votesByProposalId[selectedProposal.id];
        if (!vote) {
            return;
        }

        setVotesByProposalId((current) => ({
            ...current,
            [selectedProposal.id]: votingEngine.cast(vote, CURRENT_USER_ID, ballot),
        }));
    };

    const handleCloseVote = (): void => {
        if (!selectedProposal) {
            return;
        }

        const vote = votesByProposalId[selectedProposal.id];
        if (!vote) {
            return;
        }

        setVotesByProposalId((current) => ({
            ...current,
            [selectedProposal.id]: votingEngine.close(vote),
        }));
    };

    return (
        <section data-testid="blackout-governance-view">
            <h2>Governance</h2>
            <ProposalComposer onCreate={handleCreate} />
            <ProposalList proposals={proposals} selectedProposalId={selectedProposalId} onSelect={setSelectedProposalId} />
            {selectedProposal && (
                <ProposalDetail
                    proposal={selectedProposal}
                    vote={selectedVote}
                    tally={selectedVote ? votingEngine.tally(selectedVote) : undefined}
                    onAdvanceState={handleAdvanceState}
                    onStartVote={handleStartVote}
                    onCastVote={handleCastVote}
                    onCloseVote={handleCloseVote}
                />
            )}
            <DelegationAttestationsPanel />
        </section>
    );
}
