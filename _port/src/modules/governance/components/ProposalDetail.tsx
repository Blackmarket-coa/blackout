/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import type { ProposalDocument, VoteDocument } from "../models/types";
import type { Ballot, VoteTally } from "../../../services/governance/VotingEngine";
import type { OpinionCluster } from "../../../services/deliberation/clustering";

interface Props {
    proposal: ProposalDocument;
    vote?: VoteDocument;
    tally?: VoteTally;
    deliberationClusters?: OpinionCluster[];
    onAdvanceState: () => void;
    onStartVote: () => void;
    onCastVote: (ballot: Ballot) => void;
    onCloseVote: () => void;
}

export default function ProposalDetail({
    proposal,
    vote,
    tally,
    deliberationClusters,
    onAdvanceState,
    onStartVote,
    onCastVote,
    onCloseVote,
}: Props): React.JSX.Element {
    const isVoteOpen = Boolean(vote && !vote.closedAt);

    return (
        <section data-testid="blackout-proposal-detail">
            <h3>{proposal.title}</h3>
            <p>{proposal.body}</p>
            <p>
                <strong>State:</strong> {proposal.state}
            </p>
            <div>
                <button type="button" onClick={onAdvanceState} data-testid="blackout-proposal-advance">
                    Advance state
                </button>
                <small>Lifecycle: draft → discuss → amend → close → decide</small>
            </div>
            {!vote && proposal.state === "close" && (
                <button type="button" onClick={onStartVote} data-testid="blackout-vote-start">
                    Start vote
                </button>
            )}
            {isVoteOpen && (
                <div>
                    <h4>Cast ballot</h4>
                    <button type="button" onClick={() => onCastVote("approve")}>
                        Approve
                    </button>
                    <button type="button" onClick={() => onCastVote("reject")}>
                        Reject
                    </button>
                    <button type="button" onClick={() => onCastVote("abstain")}>
                        Abstain
                    </button>
                    <button type="button" onClick={onCloseVote} data-testid="blackout-vote-close">
                        Close vote
                    </button>
                </div>
            )}
            {tally && (
                <dl data-testid="blackout-vote-tally">
                    <dt>Approve</dt>
                    <dd>{tally.approve}</dd>
                    <dt>Reject</dt>
                    <dd>{tally.reject}</dd>
                    <dt>Abstain</dt>
                    <dd>{tally.abstain}</dd>
                    <dt>Passed</dt>
                    <dd>{String(tally.passed)}</dd>
                </dl>
            )}
            {deliberationClusters && deliberationClusters.length > 0 && (
                <section data-testid="blackout-deliberation-clusters">
                    <h4>Deliberation clusters</h4>
                    <ul>
                        {deliberationClusters.map((cluster) => (
                            <li key={cluster.id}>
                                {cluster.id}: {cluster.memberIds.length} members
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </section>
    );
}
