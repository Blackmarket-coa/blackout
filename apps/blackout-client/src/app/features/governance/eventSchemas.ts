import type { ProposalContent, ProposalOption, ProposalStatus, ProposalType, VoteContent } from './useProposals';

/**
 * Re-exported from `@blackout/protocol` so the migration flag stays accurate
 * after the v1→v2 bump for the `'consent'` proposal type. v1-shaped events
 * still normalize (back-compat) but are surfaced as `migrated: true`.
 */
export { GOVERNANCE_SCHEMA_VERSION } from '@blackout/protocol';
import { GOVERNANCE_SCHEMA_VERSION as PROTOCOL_GOVERNANCE_SCHEMA_VERSION } from '@blackout/protocol';

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
    if (
        type === 'binary' ||
        type === 'multiple_choice' ||
        type === 'ranked' ||
        type === 'consent'
    ) {
        return type;
    }
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

    // Consent proposals carry no options — the reaction palette
    // (🌱 / 🌾 / 🪨) is the choice space. Other types must have at least one
    // option to be meaningful, but we leave that enforcement to the creator UI.
    if (type !== 'consent' && options.length === 0 && optionsRaw.length > 0) {
        return {
            data: null,
            schemaVersion,
            migrated: false,
            reason: 'proposal options malformed',
        };
    }

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
        migrated: schemaVersion !== PROTOCOL_GOVERNANCE_SCHEMA_VERSION,
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
        migrated: schemaVersion !== PROTOCOL_GOVERNANCE_SCHEMA_VERSION,
        reason: null,
    };
};
