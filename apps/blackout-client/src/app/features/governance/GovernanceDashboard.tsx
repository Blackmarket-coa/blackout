import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import { ProposalCard } from './ProposalCard';
import { ProposalCreator } from './ProposalCreator';
import { ProposalDetail } from './ProposalDetail';
import { useGovernanceDiagnostics, useProposalResult, useProposals, useVotes, type ProposalModel } from './useProposals';

type GovernanceTab = 'active' | 'past' | 'create' | 'my-votes' | 'results';

const VALID_TABS: ReadonlySet<GovernanceTab> = new Set(['active', 'past', 'create', 'my-votes', 'results']);

const isValidTab = (raw: string | null): raw is GovernanceTab =>
    raw !== null && VALID_TABS.has(raw as GovernanceTab);

const voteChoiceLabel = (choice: string | string[]): string =>
    typeof choice === 'string' ? choice : choice.join(', ');

const MyVoteRow = ({
    roomId,
    proposal,
    currentUserId,
    onOpen,
}: {
    roomId: string;
    proposal: ProposalModel;
    currentUserId: string;
    onOpen: (proposalId: string) => void;
}) => {
    const votes = useVotes(proposal.proposalEventId, roomId);
    const myVote = votes.data.find((vote) => vote.voterId === currentUserId) ?? null;

    if (!myVote) return null;

    return (
        <article
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 6,
            }}
        >
            <strong>{proposal.title}</strong>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Status: {proposal.status} • Your vote: {voteChoiceLabel(myVote.choice)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => onOpen(proposal.proposalEventId)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                    }}
                >
                    View / Change Vote
                </button>
            </div>
        </article>
    );
};

const ProposalResultRow = ({
    roomId,
    proposal,
    onOpen,
}: {
    roomId: string;
    proposal: ProposalModel;
    onOpen: (proposalId: string) => void;
}) => {
    const result = useProposalResult(proposal.proposalEventId, roomId);

    return (
        <article
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 6,
            }}
        >
            <strong>{proposal.title}</strong>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Computed status: {result.data?.computedStatus ?? proposal.status} • Votes:{' '}
                {result.data && result.data.kind === 'vote' ? result.data.voteCount : 0}/
                {proposal.quorum}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => onOpen(proposal.proposalEventId)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                    }}
                >
                    View Proposal
                </button>
            </div>
        </article>
    );
};

export const GovernanceDashboard = ({ roomId }: { roomId: string }) => {
    const currentUserId = useAtomValue(userIdAtom) ?? '';
    const proposals = useProposals(roomId);
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    // Derive the active tab from the URL so the registry-declared right-panel
    // tab bar (BKL-003) drives navigation. /governance/new maps to 'create';
    // /governance?tab=<id> maps to that tab; the default is 'active'.
    const tabFromQuery = searchParams.get('tab');
    const activeTab: GovernanceTab = location.pathname.endsWith('/governance/new')
        ? 'create'
        : isValidTab(tabFromQuery)
            ? tabFromQuery
            : 'active';
    const diagnostics = useGovernanceDiagnostics(roomId, selectedProposalId ?? undefined);

    const activeProposals = useMemo(
        () => proposals.data.filter((proposal) => proposal.status === 'active'),
        [proposals.data],
    );
    const pastProposals = useMemo(
        () => proposals.data.filter((proposal) => proposal.status !== 'active'),
        [proposals.data],
    );

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header style={{ display: 'grid', gap: 8 }}>
                <h2 style={{ margin: 0 }}>Governance Dashboard</h2>
                <RegistryTabBar
                    kind="right-panel"
                    pathname={`${location.pathname}${location.search}`}
                    barStyle={{
                        display: 'inline-flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        background: 'transparent',
                        borderTop: 'none',
                        padding: 0,
                        justifyContent: 'flex-start',
                    }}
                    itemStyle={{
                        flex: 'none',
                        flexDirection: 'row',
                        gap: 6,
                        padding: '6px 10px',
                        minHeight: 0,
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        fontSize: 13,
                    }}
                    activeItemStyle={{
                        border: '1px solid var(--accent-primary)',
                        background: 'var(--accent-muted)',
                    }}
                    data-testid="governance-right-panel-tabs"
                />
            </header>


            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 4,
                }}
            >
                <strong style={{ fontSize: 13 }}>Governance event diagnostics</strong>
                <small style={{ color: 'var(--text-secondary)' }}>
                    Invalid proposals: {diagnostics.invalidProposalEvents} • Migrated proposals:{' '}
                    {diagnostics.migratedProposalEvents} • Invalid votes:{' '}
                    {diagnostics.invalidVoteEvents} • Migrated votes:{' '}
                    {diagnostics.migratedVoteEvents} • Duplicate votes dropped:{' '}
                    {diagnostics.duplicateVoteEventsDropped}
                </small>
            </section>

            {selectedProposalId ? (
                <section
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 12,
                        background: 'var(--bg-surface)',
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setSelectedProposalId(null)}
                        style={{
                            justifySelf: 'start',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                        }}
                    >
                        ← Back to proposals
                    </button>
                    <ProposalDetail
                        roomId={roomId}
                        proposalId={selectedProposalId}
                        currentUserId={currentUserId}
                    />
                </section>
            ) : null}

            {!selectedProposalId && activeTab === 'active' ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>Active Proposals</h3>
                    {activeProposals.map((proposal) => (
                        <ProposalCard
                            key={proposal.proposalEventId}
                            roomId={roomId}
                            proposal={proposal}
                            currentUserId={currentUserId}
                            onOpen={setSelectedProposalId}
                        />
                    ))}
                    {!proposals.loading && activeProposals.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', padding: 8 }}>
                            No active proposals.
                        </div>
                    ) : null}
                </section>
            ) : null}

            {!selectedProposalId && activeTab === 'past' ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>Past Proposals</h3>
                    {pastProposals.map((proposal) => (
                        <ProposalCard
                            key={proposal.proposalEventId}
                            roomId={roomId}
                            proposal={proposal}
                            currentUserId={currentUserId}
                            onOpen={setSelectedProposalId}
                        />
                    ))}
                    {!proposals.loading && pastProposals.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', padding: 8 }}>
                            No past proposals.
                        </div>
                    ) : null}
                </section>
            ) : null}

            {!selectedProposalId && activeTab === 'create' ? (
                <ProposalCreator roomId={roomId} />
            ) : null}

            {!selectedProposalId && activeTab === 'my-votes' ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>My Votes</h3>
                    {proposals.data.map((proposal) => (
                        <MyVoteRow
                            key={proposal.proposalEventId}
                            roomId={roomId}
                            proposal={proposal}
                            currentUserId={currentUserId}
                            onOpen={setSelectedProposalId}
                        />
                    ))}
                    {!proposals.loading && proposals.data.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', padding: 8 }}>
                            No proposals available for voting history.
                        </div>
                    ) : null}
                </section>
            ) : null}

            {!selectedProposalId && activeTab === 'results' ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>Results</h3>
                    {proposals.data.map((proposal) => (
                        <ProposalResultRow
                            key={proposal.proposalEventId}
                            roomId={roomId}
                            proposal={proposal}
                            onOpen={setSelectedProposalId}
                        />
                    ))}
                    {!proposals.loading && proposals.data.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', padding: 8 }}>
                            No proposal results yet.
                        </div>
                    ) : null}
                </section>
            ) : null}
        </section>
    );
};

export default GovernanceDashboard;
