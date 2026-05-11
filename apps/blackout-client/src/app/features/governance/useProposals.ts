import { useCallback, useMemo } from 'react';
import {
    GOVERNANCE_PROPOSAL_EVENT_TYPE,
    GOVERNANCE_VOTE_EVENT_TYPE,
    type GovernanceProposalOption,
    type GovernanceProposalPayload,
    type GovernanceProposalStatus,
    type GovernanceProposalType,
    type GovernanceVotePayload,
} from '@blackout/protocol';
import { createGovernanceMatrixActions } from '@blackout/sdk';
import {
    deriveConsentStatus,
    isConsentKey,
    tallyConsent,
    type ConsentReaction,
    type ConsentTally,
} from '../../../lib/bmc-core/consent';

export type ProposalOption = GovernanceProposalOption;
export type ProposalContent = GovernanceProposalPayload;
export type ProposalStatus = GovernanceProposalStatus;
export type ProposalType = GovernanceProposalType;
export type VoteContent = GovernanceVotePayload;
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { useCompleteQuest } from '../quests/useQuests';
import {
    GOVERNANCE_SCHEMA_VERSION,
    normalizeProposalEventContent,
    normalizeVoteEventContent,
} from './eventSchemas';

export interface ProposalModel extends ProposalContent {
    proposalEventId: string;
    stateKey: string;
    authorId: string;
    timestamp: number;
    schemaVersion: number;
    migrated: boolean;
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

const PROPOSAL_EVENT_TYPE = GOVERNANCE_PROPOSAL_EVENT_TYPE;
const VOTE_EVENT_TYPE = GOVERNANCE_VOTE_EVENT_TYPE;

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
    const actions = useMemo(
        () =>
            createGovernanceMatrixActions({
                sendEvent: (rid, et, content) => client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (payload: VoteContent) => actions.castVote(roomId, payload),
        [actions, roomId],
    );
};

/**
 * Hook: read `m.reaction` events that target a proposal and carry one of the
 * three consent keys. Returns the rows in newest-first order, with optional
 * notes lifted from the `co.bmc.consent.note` content field (concerns and
 * objections write a note alongside the reaction so the tally can surface
 * the reason without an extra round-trip).
 *
 * Redacted reactions are dropped so the tally reflects the live state.
 */
export const useConsentReactions = (
    proposalId: string | null,
    roomId: string,
): { data: ConsentReaction[]; loading: boolean; error: unknown } => {
    const timeline = useRoomTimeline(roomId);

    return useMemo(() => {
        if (!proposalId) {
            return { data: [], loading: timeline.loading, error: timeline.error };
        }

        const reactions: ConsentReaction[] = [];
        for (const event of timeline.data) {
            if (event.getType() !== 'm.reaction' || event.isRedacted()) continue;
            const content = event.getContent<Record<string, unknown>>();
            const relates = content['m.relates_to'];
            if (!relates || typeof relates !== 'object') continue;
            const rel = relates as Record<string, unknown>;
            if (rel.rel_type !== 'm.annotation' || rel.event_id !== proposalId) continue;
            const key = rel.key;
            if (!isConsentKey(key)) continue;
            const reactorId = event.getSender();
            if (!reactorId) continue;
            const note =
                typeof content['co.bmc.consent.note'] === 'string'
                    ? (content['co.bmc.consent.note'] as string)
                    : undefined;
            reactions.push({
                reactorId,
                key,
                eventId: event.getId() ?? `${event.getTs()}-${reactorId}`,
                timestamp: event.getTs(),
                note,
            });
        }
        reactions.sort((a, b) => b.timestamp - a.timestamp);
        return { data: reactions, loading: timeline.loading, error: timeline.error };
    }, [proposalId, timeline.data, timeline.loading, timeline.error]);
};

/**
 * Hook: send a consent reaction (🌱 / 🌾 / 🪨) targeting a proposal. Accepts
 * an optional note for concerns and objections; the note is carried in
 * `co.bmc.consent.note` on the same `m.reaction` event so a single round-trip
 * captures stance + reason.
 */
export const useCastConsent = (roomId: string) => {
    const client = useMatrixClient();
    const completeQuest = useCompleteQuest();
    return useCallback(
        async ({
            proposalEventId,
            key,
            note,
        }: {
            proposalEventId: string;
            key: ConsentReaction['key'];
            note?: string;
        }) => {
            const content: Record<string, unknown> = {
                'm.relates_to': {
                    rel_type: 'm.annotation',
                    event_id: proposalEventId,
                    key,
                },
            };
            if (note && note.trim().length > 0) {
                content['co.bmc.consent.note'] = note.trim();
            }
            await client.sendEvent(roomId, 'm.reaction' as never, content as never);
            // J3 auto-completion: any consent reaction (🌱/🌾/🪨) ticks the
            // first-consent quest. Idempotent.
            void completeQuest('first-consent', roomId);
        },
        [client, completeQuest, roomId],
    );
};

export interface ProposalResultVote {
    proposal: ProposalModel;
    voteCount: number;
    quorumReached: boolean;
    expired: boolean;
    computedStatus: ProposalStatus;
    optionResults: Array<{ optionId: string; count: number }>;
    leadingOptionId: string | null;
    /** Discriminator so renderers can branch without re-checking `proposal.type`. */
    kind: 'vote';
}

export interface ProposalResultConsent {
    proposal: ProposalModel;
    tally: ConsentTally;
    expired: boolean;
    quorumReached: boolean;
    computedStatus: ProposalStatus;
    kind: 'consent';
}

export type ProposalResultData = ProposalResultVote | ProposalResultConsent;

export const useProposalResult = (proposalId: string, roomId: string) => {
    const proposals = useProposals(roomId);
    const votes = useVotes(proposalId, roomId);
    const consentReactions = useConsentReactions(proposalId, roomId);

    return useMemo(() => {
        const proposal = proposals.data.find((item) => item.proposalEventId === proposalId) ?? null;
        if (!proposal) {
            return {
                data: null as ProposalResultData | null,
                loading: proposals.loading || votes.loading || consentReactions.loading,
                error: proposals.error ?? votes.error ?? consentReactions.error,
            };
        }

        const now = Date.now();
        const deadlineTs = Date.parse(proposal.deadline);
        const expired = Number.isFinite(deadlineTs) ? now >= deadlineTs : false;

        if (proposal.type === 'consent') {
            const tally = tallyConsent(consentReactions.data);
            const quorumReached = tally.consents >= proposal.quorum;
            let computedStatus: ProposalStatus = proposal.status;
            if (proposal.status === 'active') {
                computedStatus = deriveConsentStatus({
                    tally,
                    quorum: proposal.quorum,
                    deadlineMs: deadlineTs,
                    nowMs: now,
                });
            }
            return {
                data: {
                    proposal,
                    tally,
                    expired,
                    quorumReached,
                    computedStatus,
                    kind: 'consent',
                } satisfies ProposalResultConsent,
                loading: proposals.loading || consentReactions.loading,
                error: proposals.error ?? consentReactions.error,
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
                kind: 'vote',
            } satisfies ProposalResultVote,
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
        consentReactions.data,
        consentReactions.error,
        consentReactions.loading,
    ]);
};

export const useCreateProposal = (roomId: string) => {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createGovernanceMatrixActions({
                sendEvent: (rid, et, content) => client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (content: ProposalContent) => {
            const stateKey = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await actions.createProposal(roomId, content, stateKey);
        },
        [actions, roomId],
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
