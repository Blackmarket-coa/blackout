import type { GovernanceProposalPayload, GovernanceVotePayload } from '@blackout/protocol';

export const buildSampleProposalPayload = (): GovernanceProposalPayload => ({
  title: 'Treasury allocation',
  description: 'Allocate budget to federation infra',
  type: 'multiple_choice',
  options: [
    { id: 'infra', label: 'Infrastructure' },
    { id: 'ops', label: 'Operations' },
  ],
  quorum: 25,
  deadline: new Date().toISOString(),
  eligibility: 'all',
  status: 'active',
});

export const buildSampleVotePayload = (): GovernanceVotePayload => ({
  proposalEventId: 'evt_protocol_demo',
  choice: 'infra',
});
