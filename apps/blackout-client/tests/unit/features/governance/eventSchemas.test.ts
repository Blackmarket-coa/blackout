import { describe, expect, it } from 'vitest';
import {
    normalizeProposalEventContent,
    normalizeVoteEventContent,
} from '../../../../src/app/features/governance/eventSchemas';

describe('governance event schema normalization', () => {
    it('migrates legacy proposal payload fields', () => {
        const result = normalizeProposalEventContent({
            title: 'Legacy proposal',
            description: 'desc',
            type: 'binary',
            options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
            ],
            quorum_required: 2,
            ends_at: '2030-01-01T00:00:00.000Z',
            phase: 'open',
        });

        expect(result.data?.quorum).toBe(2);
        expect(result.data?.deadline).toBe('2030-01-01T00:00:00.000Z');
        expect(result.data?.status).toBe('active');
        expect(result.migrated).toBe(true);
    });

    it('rejects malformed vote payloads and accepts legacy proposal_id', () => {
        const invalid = normalizeVoteEventContent({ proposal_id: 123, choice: 1 });
        expect(invalid.data).toBeNull();

        const valid = normalizeVoteEventContent({ proposal_id: 'abc', choice: 'yes' });
        expect(valid.data?.proposalEventId).toBe('abc');
    });
});
