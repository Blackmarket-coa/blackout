import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { ProposalCard } from './ProposalCard';
import { ProposalCreator } from './ProposalCreator';
import { ProposalDetail } from './ProposalDetail';
import { useProposals, type ProposalStatus, type ProposalType } from './useProposals';

export const GovernanceDashboard = ({ roomId }: { roomId: string }) => {
  const currentUserId = useAtomValue(userIdAtom) ?? '';
  const proposals = useProposals(roomId);

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ProposalType>('all');

  const filtered = useMemo(
    () =>
      proposals.data.filter((proposal) => {
        if (statusFilter !== 'all' && proposal.status !== statusFilter) return false;
        if (typeFilter !== 'all' && proposal.type !== typeFilter) return false;
        return true;
      }),
    [proposals.data, statusFilter, typeFilter],
  );

  const activeProposals = filtered.filter((proposal) => proposal.status === 'active');
  const pastProposals = filtered.filter((proposal) => proposal.status !== 'active');

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Governance Dashboard</h2>

        <div style={{ display: 'inline-flex', gap: 8 }}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | ProposalStatus)}
            style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '4px 8px' }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | ProposalType)}
            style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '4px 8px' }}
          >
            <option value="all">All types</option>
            <option value="binary">Binary</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="ranked">Ranked</option>
          </select>

          <button
            type="button"
            onClick={() => setShowCreator((prev) => !prev)}
            style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--accent-primary)', color: 'var(--bg-surface)', padding: '6px 10px' }}
          >
            {showCreator ? 'Close Creator' : 'Create Proposal'}
          </button>
        </div>
      </header>

      {showCreator ? (
        <ProposalCreator
          roomId={roomId}
          onCreated={() => {
            setShowCreator(false);
          }}
        />
      ) : null}

      {selectedProposalId ? (
        <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)', padding: 12, display: 'grid', gap: 8 }}>
          <button
            type="button"
            onClick={() => setSelectedProposalId(null)}
            style={{ justifySelf: 'start', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '4px 8px' }}
          >
            ← Back to proposals
          </button>
          <ProposalDetail roomId={roomId} proposalId={selectedProposalId} currentUserId={currentUserId} />
        </section>
      ) : (
        <>
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
              <div style={{ color: 'var(--text-secondary)', padding: 8 }}>No active proposals.</div>
            ) : null}
          </section>

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
              <div style={{ color: 'var(--text-secondary)', padding: 8 }}>No past proposals.</div>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
};

export default GovernanceDashboard;
