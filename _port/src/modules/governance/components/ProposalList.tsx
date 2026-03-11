/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import type { ProposalDocument } from "../models/types";

interface Props {
    proposals: ProposalDocument[];
    selectedProposalId?: string;
    onSelect: (proposalId: string) => void;
}

export default function ProposalList({ proposals, selectedProposalId, onSelect }: Props): React.JSX.Element {
    if (!proposals.length) {
        return <p data-testid="blackout-governance-empty">No proposals yet.</p>;
    }

    return (
        <ul data-testid="blackout-governance-proposals">
            {proposals.map((proposal) => (
                <li key={proposal.id}>
                    <button
                        type="button"
                        onClick={() => onSelect(proposal.id)}
                        aria-pressed={selectedProposalId === proposal.id}
                        data-testid={`blackout-proposal-${proposal.id}`}
                    >
                        {proposal.title} ({proposal.state})
                    </button>
                </li>
            ))}
        </ul>
    );
}
