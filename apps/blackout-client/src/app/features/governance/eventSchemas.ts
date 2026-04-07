import type { ProposalContent, ProposalOption, ProposalStatus, ProposalType, VoteContent } from './useProposals';

export const GOVERNANCE_SCHEMA_VERSION = 1;

const toProposalStatus = (status: unknown, phase: unknown): ProposalStatus | null => {
    if (status === 'active' || status === 'passed' || status === 'failed' || status === 'cancelled') {
        return status;
    }
    if (phase === 'open') return 'active';
    if (phase === 'approved') return 'passed';
    if (phase === 'rejected') return 'failed';
    return null;
};

const toProposalType = (type: unknown): ProposalType | null => {
    if (type === 'binary' || type === 'multiple_choice' || type === 'ranked') return type;
    return null;
};

export interface GovernanceNormalizationResult<T> {
    data: T | null;
    schemaVersion: number;
    migrated: boolean;
    reason: string | null;
}

export const normalizeProposalEventContent = (
    content: Record<string, unknown>,
): GovernanceNormalizationResult<ProposalContent> => {
    const schemaVersionRaw = content.schemaVersion ?? content.schema_version;
    const schemaVersion =
        typeof schemaVersionRaw === 'number' ? Math.max(0, Math.floor(schemaVersionRaw)) : 0;

    const type = toProposalType(content.type);
    const status = toProposalStatus(content.status, content.phase);
    const title = typeof content.title === 'string' ? content.title : null;
    const description = typeof content.description === 'string' ? content.description : null;
    const deadline =
        typeof content.deadline === 'string'
            ? content.deadline
            : typeof content.ends_at === 'string'
              ? content.ends_at
              : null;
    const quorum =
        typeof content.quorum === 'number'
            ? content.quorum
            : typeof content.quorum_required === 'number'
              ? content.quorum_required
              : null;
    const eligibility =
        typeof content.eligibility === 'string' ? content.eligibility : ('all' as const);

    if (!type || !status || !title || !description || !deadline || typeof quorum !== 'number') {
        return {
            data: null,
            schemaVersion,
            migrated: false,
            reason: 'missing required proposal fields',
        };
    }

    const optionsRaw = Array.isArray(content.options) ? content.options : [];
    const options = optionsRaw
        .map((option) => {
            if (!option || typeof option !== 'object') return null;
            const item = option as Record<string, unknown>;
            if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
            return { id: item.id, label: item.label } satisfies ProposalOption;
        })
        .filter((item): item is ProposalOption => item !== null);

    return {
        data: {
            title,
            description,
            type,
            options,
            quorum,
            deadline,
            eligibility: eligibility as ProposalContent['eligibility'],
            status,
        },
        schemaVersion,
        migrated: schemaVersion !== GOVERNANCE_SCHEMA_VERSION,
        reason: null,
    };
};

export const normalizeVoteEventContent = (
    content: Record<string, unknown>,
): GovernanceNormalizationResult<VoteContent> => {
    const schemaVersionRaw = content.schemaVersion ?? content.schema_version;
    const schemaVersion =
        typeof schemaVersionRaw === 'number' ? Math.max(0, Math.floor(schemaVersionRaw)) : 0;

    const proposalEventId =
        typeof content.proposalEventId === 'string'
            ? content.proposalEventId
            : typeof content.proposal_id === 'string'
              ? content.proposal_id
              : null;
    const choice = content.choice;
    if (
        !proposalEventId ||
        (typeof choice !== 'string' &&
            !(Array.isArray(choice) && choice.every((item) => typeof item === 'string')))
    ) {
        return { data: null, schemaVersion, migrated: false, reason: 'invalid vote payload' };
    }

    return {
        data: {
            proposalEventId,
            choice,
        },
        schemaVersion,
        migrated: schemaVersion !== GOVERNANCE_SCHEMA_VERSION,
        reason: null,
    };
};
