import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useRoomTimeline } from '../../hooks/useTimeline';
import {
    GOVERNANCE_SCHEMA_VERSION,
    normalizeProposalEventContent,
    normalizeVoteEventContent,
} from './eventSchemas';

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
    schemaVersion: number;
    migrated: boolean;
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
    schemaVersion: number;
    migrated: boolean;
}

export interface GovernanceEventDiagnostics {
    invalidProposalEvents: number;
    invalidVoteEvents: number;
    migratedProposalEvents: number;
    migratedVoteEvents: number;
    duplicateVoteEventsDropped: number;
}

const PROPOSAL_EVENT_TYPE = 'co.bmc.proposal';
const VOTE_EVENT_TYPE = 'co.bmc.vote';

export const useProposals = (roomId: string) => {
    const roomState = useRoom(roomId);

    return useMemo(() => {
        if (!roomState.data) {
            return {
                data: [] as ProposalModel[],
                loading: roomState.loading,
                error: roomState.error,
                diagnostics: {
                    invalidProposalEvents: 0,
                    invalidVoteEvents: 0,
                    migratedProposalEvents: 0,
                    migratedVoteEvents: 0,
                    duplicateVoteEventsDropped: 0,
                } satisfies GovernanceEventDiagnostics,
            };
        }

        const proposalEventsRaw = roomState.data.currentState.getStateEvents(PROPOSAL_EVENT_TYPE);
        const proposalEvents = Array.isArray(proposalEventsRaw)
            ? proposalEventsRaw
            : proposalEventsRaw
              ? [proposalEventsRaw]
              : [];

        let invalidProposalEvents = 0;
        let migratedProposalEvents = 0;

        const proposals = proposalEvents
            .map((event) => {
                const normalized = normalizeProposalEventContent(
                    event.getContent<Record<string, unknown>>(),
                );
                if (!normalized.data) {
                    invalidProposalEvents += 1;
                    return null;
                }
                if (normalized.migrated) migratedProposalEvents += 1;

                return {
                    ...normalized.data,
                    proposalEventId: event.getId() ?? `${roomId}-${event.getStateKey()}`,
                    stateKey: event.getStateKey() || '',
                    authorId: event.getSender() || 'unknown',
                    timestamp: event.getTs(),
                    schemaVersion: normalized.schemaVersion,
                    migrated: normalized.migrated,
                };
            })
            .filter((item): item is ProposalModel => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp);

        return {
            data: proposals,
            loading: roomState.loading,
            error: roomState.error,
            diagnostics: {
                invalidProposalEvents,
                invalidVoteEvents: 0,
                migratedProposalEvents,
                migratedVoteEvents: 0,
                duplicateVoteEventsDropped: 0,
            } satisfies GovernanceEventDiagnostics,
        };
    }, [roomId, roomState.data, roomState.error, roomState.loading]);
};

export const useVotes = (proposalId: string | null, roomId: string) => {
    const timeline = useRoomTimeline(roomId);

    return useMemo(() => {
        let invalidVoteEvents = 0;
        let migratedVoteEvents = 0;
        let duplicateVoteEventsDropped = 0;

        const seenEventIds = new Set<string>();

        const votes = timeline.data
            .filter((event) => event.getType() === VOTE_EVENT_TYPE)
            .map((event) => {
                const content = event.getContent<Record<string, unknown>>();
                const normalized = normalizeVoteEventContent(content);
                if (!normalized.data) {
                    invalidVoteEvents += 1;
                    return null;
                }
                if (proposalId && normalized.data.proposalEventId !== proposalId) return null;

                const eventId = event.getId() ?? `${event.getTs()}-${event.getSender()}`;
                if (seenEventIds.has(eventId)) {
                    duplicateVoteEventsDropped += 1;
                    return null;
                }
                seenEventIds.add(eventId);

                if (normalized.migrated) migratedVoteEvents += 1;

                return {
                    eventId,
                    proposalEventId: normalized.data.proposalEventId,
                    voterId: event.getSender() ?? 'unknown',
                    choice: normalized.data.choice,
                    timestamp: event.getTs(),
                    schemaVersion: normalized.schemaVersion,
                    migrated: normalized.migrated,
                } satisfies VoteModel;
            })
            .filter((item): item is VoteModel => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp);

        const latestByVoter = new Map<string, VoteModel>();
        votes.forEach((vote) => {
            const existing = latestByVoter.get(vote.voterId);
            if (!existing || vote.timestamp > existing.timestamp) {
                latestByVoter.set(vote.voterId, vote);
            }
        });

        const effectiveVotes = [...latestByVoter.values()];

        return {
            data: effectiveVotes,
            loading: timeline.loading,
            error: timeline.error,
            diagnostics: {
                invalidProposalEvents: 0,
                invalidVoteEvents,
                migratedProposalEvents: 0,
                migratedVoteEvents,
                duplicateVoteEventsDropped,
            } satisfies GovernanceEventDiagnostics,
        };
    }, [proposalId, timeline.data, timeline.error, timeline.loading]);
};

export const useCastVote = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (payload: VoteContent) => {
            await (
                client as unknown as {
                    sendEvent: (
                        rid: string,
                        et: string,
                        content: Record<string, unknown>,
                    ) => Promise<unknown>;
                }
            ).sendEvent(roomId, VOTE_EVENT_TYPE, {
                ...payload,
                schemaVersion: GOVERNANCE_SCHEMA_VERSION,
                voteId: crypto.randomUUID(),
                submittedAt: Date.now(),
            });
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
                const weight =
                    proposal.type === 'ranked' ? Math.max(1, vote.choice.length - index) : 1;
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
    }, [
        proposalId,
        proposals.data,
        proposals.error,
        proposals.loading,
        votes.data,
        votes.error,
        votes.loading,
    ]);
};

export const useCreateProposal = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (content: ProposalContent) => {
            const stateKey = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await client.sendStateEvent(
                roomId,
                PROPOSAL_EVENT_TYPE as never,
                { ...content, schemaVersion: GOVERNANCE_SCHEMA_VERSION } as never,
                stateKey,
            );
        },
        [client, roomId],
    );
};

export const useGovernanceDiagnostics = (roomId: string, selectedProposalId?: string) => {
    const proposals = useProposals(roomId);
    const votes = useVotes(selectedProposalId ?? null, roomId);

    return {
        invalidProposalEvents: proposals.diagnostics.invalidProposalEvents,
        migratedProposalEvents: proposals.diagnostics.migratedProposalEvents,
        invalidVoteEvents: votes.diagnostics.invalidVoteEvents,
        migratedVoteEvents: votes.diagnostics.migratedVoteEvents,
        duplicateVoteEventsDropped: votes.diagnostics.duplicateVoteEventsDropped,
    } satisfies GovernanceEventDiagnostics;
};

export { PROPOSAL_EVENT_TYPE, VOTE_EVENT_TYPE };
