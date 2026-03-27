/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useMemo, useState } from "react";

import type { ProposalDocument } from "../models/types";

interface Props {
    proposals: ProposalDocument[];
    selectedProposalId?: string;
    onSelect: (proposalId: string) => void;
}

export default function ProposalList({ proposals, selectedProposalId, onSelect }: Props): React.JSX.Element {
    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState<ProposalDocument["state"] | "all">("all");

    const visibleProposals = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return proposals
            .filter((proposal) => (stateFilter === "all" ? true : proposal.state === stateFilter))
            .filter((proposal) =>
                normalizedSearch
                    ? proposal.title.toLowerCase().includes(normalizedSearch) ||
                      proposal.body.toLowerCase().includes(normalizedSearch)
                    : true,
            );
    }, [proposals, search, stateFilter]);

    if (!proposals.length) {
        return <p data-testid="blackout-governance-empty">No proposals yet.</p>;
    }

    return (
        <section>
            <div>
                <label>
                    Search governance threads
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        data-testid="blackout-governance-search"
                    />
                </label>
                <label>
                    State visibility
                    <select
                        value={stateFilter}
                        onChange={(event) => setStateFilter(event.target.value as ProposalDocument["state"] | "all")}
                        data-testid="blackout-governance-state-filter"
                    >
                        <option value="all">All states</option>
                        <option value="draft">Draft</option>
                        <option value="discuss">Discuss</option>
                        <option value="amend">Amend</option>
                        <option value="close">Close</option>
                        <option value="decide">Decide</option>
                    </select>
                </label>
            </div>
            <p data-testid="blackout-governance-visible-count">
                Visible proposals: {visibleProposals.length} / {proposals.length}
            </p>
            <ul data-testid="blackout-governance-proposals">
                {visibleProposals.map((proposal) => (
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
            {!visibleProposals.length && (
                <p data-testid="blackout-governance-filter-empty">No proposals match the current search/filter.</p>
            )}
        </section>
    );
}
