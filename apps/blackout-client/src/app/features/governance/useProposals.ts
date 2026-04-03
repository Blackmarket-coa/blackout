import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useRoomTimeline } from '../../hooks/useTimeline';

export interface ProposalOption {
  id: string;
  label: string;
}

export type ProposalType = 'binary' | 'multiple_choice' | 'ranked';
export type ProposalStatus = 'active' | 'passed' | 'failed' | 'cancelled';

export interface ProposalContent {
  title: string;
  description: string;
  type: ProposalType;
  options: ProposalOption[];
  quorum: number;
  deadline: string;
  eligibility: 'all' | `role:${string}` | `power:${string}`;
  status: ProposalStatus;
}

export interface ProposalModel extends ProposalContent {
  proposalEventId: string;
  stateKey: string;
  authorId: string;
  timestamp: number;
}

export interface VoteContent {
  proposalEventId: string;
  choice: string | string[];
}

export interface VoteModel {
  eventId: string;
  proposalEventId: string;
  voterId: string;
  choice: string | string[];
  timestamp: number;
}

const PROPOSAL_EVENT_TYPE = 'co.bmc.proposal';
const VOTE_EVENT_TYPE = 'co.bmc.vote';

const normalizeProposalContent = (content: Record<string, unknown>): ProposalContent | null => {
  const type = content.type;
  const status = content.status;

  if (type !== 'binary' && type !== 'multiple_choice' && type !== 'ranked') return null;
  if (status !== 'active' && status !== 'passed' && status !== 'failed' && status !== 'cancelled') return null;
  if (typeof content.title !== 'string' || typeof content.description !== 'string') return null;
  if (typeof content.deadline !== 'string' || typeof content.quorum !== 'number') return null;
  if (typeof content.eligibility !== 'string') return null;

  const optionsRaw = Array.isArray(content.options) ? content.options : [];
  const options = optionsRaw
    .map((option) => {
      if (!option || typeof option !== 'object') return null;
      const item = option as Record<string, unknown>;
      if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
      return { id: item.id, label: item.label };
    })
    .filter((item): item is ProposalOption => item !== null);

  return {
    title: content.title,
    description: content.description,
    type,
    options,
    quorum: content.quorum,
    deadline: content.deadline,
    eligibility: content.eligibility as ProposalContent['eligibility'],
    status,
  };
};

export const useProposals = (roomId: string) => {
  const roomState = useRoom(roomId);

  return useMemo(() => {
    if (!roomState.data) {
      return { data: [] as ProposalModel[], loading: roomState.loading, error: roomState.error };
    }

    const proposalEventsRaw = roomState.data.currentState.getStateEvents(PROPOSAL_EVENT_TYPE);
    const proposalEvents = Array.isArray(proposalEventsRaw)
      ? proposalEventsRaw
      : proposalEventsRaw
        ? [proposalEventsRaw]
        : [];

    const proposals = proposalEvents
      .map((event) => {
        const normalized = normalizeProposalContent(event.getContent<Record<string, unknown>>());
        if (!normalized) return null;

        return {
          ...normalized,
          proposalEventId: event.getId() ?? `${roomId}-${event.getStateKey()}`,
          stateKey: event.getStateKey() || '',
          authorId: event.getSender() || 'unknown',
          timestamp: event.getTs(),
        };
      })
      .filter((item): item is ProposalModel => item !== null)
      .sort((a, b) => b.timestamp - a.timestamp);

    return {
      data: proposals,
      loading: roomState.loading,
      error: roomState.error,
    };
  }, [roomId, roomState.data, roomState.error, roomState.loading]);
};

export const useVotes = (proposalId: string, roomId: string) => {
  const timeline = useRoomTimeline(roomId);

  return useMemo(() => {
    const votes = timeline.data
      .filter((event) => event.getType() === VOTE_EVENT_TYPE)
      .map((event) => {
        const content = event.getContent<VoteContent>();
        if (content.proposalEventId !== proposalId) return null;
        if (typeof content.choice !== 'string' && !Array.isArray(content.choice)) return null;

        return {
          eventId: event.getId() ?? `${event.getTs()}-${event.getSender()}`,
          proposalEventId: content.proposalEventId,
          voterId: event.getSender() ?? 'unknown',
          choice: content.choice,
          timestamp: event.getTs(),
        } satisfies VoteModel;
      })
      .filter((item): item is VoteModel => item !== null)
      .sort((a, b) => b.timestamp - a.timestamp);

    const latestByVoter = new Map<string, VoteModel>();
    votes.forEach((vote) => {
      if (!latestByVoter.has(vote.voterId)) {
        latestByVoter.set(vote.voterId, vote);
      }
    });

    const effectiveVotes = [...latestByVoter.values()];

    return {
      data: effectiveVotes,
      loading: timeline.loading,
      error: timeline.error,
    };
  }, [proposalId, timeline.data, timeline.error, timeline.loading]);
};

export const useCastVote = (roomId: string) => {
  const client = useMatrixClient();

  return useCallback(
    async (payload: VoteContent) => {
      await (client as unknown as {
        sendEvent: (rid: string, et: string, content: Record<string, unknown>) => Promise<unknown>;
      }).sendEvent(roomId, VOTE_EVENT_TYPE, payload as unknown as Record<string, unknown>);
    },
    [client, roomId],
  );
};

export const useProposalResult = (proposalId: string, roomId: string) => {
  const proposals = useProposals(roomId);
  const votes = useVotes(proposalId, roomId);

  return useMemo(() => {
    const proposal = proposals.data.find((item) => item.proposalEventId === proposalId) ?? null;
    if (!proposal) {
      return {
        data: null,
        loading: proposals.loading || votes.loading,
        error: proposals.error ?? votes.error,
      };
    }

    const byOption = new Map<string, number>();
    proposal.options.forEach((option) => byOption.set(option.id, 0));

    votes.data.forEach((vote) => {
      if (typeof vote.choice === 'string') {
        byOption.set(vote.choice, (byOption.get(vote.choice) ?? 0) + 1);
        return;
      }

      vote.choice.forEach((choice, index) => {
        const weight = proposal.type === 'ranked' ? Math.max(1, vote.choice.length - index) : 1;
        byOption.set(choice, (byOption.get(choice) ?? 0) + weight);
      });
    });

    const voteCount = votes.data.length;
    const quorumReached = voteCount >= proposal.quorum;
    const now = Date.now();
    const deadlineTs = Date.parse(proposal.deadline);
    const expired = Number.isFinite(deadlineTs) ? now >= deadlineTs : false;

    const ranked = [...byOption.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0];

    let computedStatus: ProposalStatus = proposal.status;
    if (proposal.status === 'active' && expired) {
      computedStatus = quorumReached ? 'passed' : 'failed';
    }

    return {
      data: {
        proposal,
        voteCount,
        quorumReached,
        expired,
        computedStatus,
        optionResults: ranked.map(([optionId, count]) => ({ optionId, count })),
        leadingOptionId: top?.[0] ?? null,
      },
      loading: proposals.loading || votes.loading,
      error: proposals.error ?? votes.error,
    };
  }, [proposalId, proposals.data, proposals.error, proposals.loading, votes.data, votes.error, votes.loading]);
};

export const useCreateProposal = (roomId: string) => {
  const client = useMatrixClient();

  return useCallback(
    async (content: ProposalContent) => {
      const stateKey = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await client.sendStateEvent(roomId, PROPOSAL_EVENT_TYPE as never, content as never, stateKey);
    },
    [client, roomId],
  );
};

export { PROPOSAL_EVENT_TYPE, VOTE_EVENT_TYPE };
