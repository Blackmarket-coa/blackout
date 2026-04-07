// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { userIdAtom } from '../../../../src/app/state/auth';
import { GovernanceDashboard } from '../../../../src/app/features/governance/GovernanceDashboard';
import type {
    ProposalModel,
    VoteModel,
} from '../../../../src/app/features/governance/useProposals';

const mountedRoots: ReactDOM.Root[] = [];

const proposalA: ProposalModel = {
    proposalEventId: 'proposal-a',
    stateKey: 'proposal-a',
    authorId: '@alice:example.org',
    timestamp: 100,
    title: 'Enable feature A',
    description: 'desc',
    type: 'binary',
    options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
    ],
    quorum: 2,
    deadline: '2099-01-01T00:00:00.000Z',
    eligibility: 'all',
    status: 'active',
    schemaVersion: 1,
    migrated: false,
};

const proposalB: ProposalModel = {
    ...proposalA,
    proposalEventId: 'proposal-b',
    stateKey: 'proposal-b',
    title: 'Retire feature B',
    status: 'passed',
};

let mockProposals: ProposalModel[] = [proposalA, proposalB];
let voteByProposal: Record<string, VoteModel[]> = {
    'proposal-a': [
        {
            eventId: 'vote-old',
            proposalEventId: 'proposal-a',
            voterId: '@me:example.org',
            choice: 'no',
            timestamp: 100,
            schemaVersion: 1,
            migrated: false,
        },
        {
            eventId: 'vote-new',
            proposalEventId: 'proposal-a',
            voterId: '@me:example.org',
            choice: 'yes',
            timestamp: 101,
            schemaVersion: 1,
            migrated: false,
        },
    ],
    'proposal-b': [],
};

vi.mock('../../../../src/app/features/governance/ProposalCard', () => ({
    ProposalCard: ({
        proposal,
        onOpen,
    }: {
        proposal: ProposalModel;
        onOpen: (proposalId: string) => void;
    }) => (
        <button type="button" onClick={() => onOpen(proposal.proposalEventId)}>
            card:{proposal.title}
        </button>
    ),
}));

vi.mock('../../../../src/app/features/governance/ProposalCreator', () => ({
    ProposalCreator: () => <div data-testid="proposal-creator">proposal creator</div>,
}));

vi.mock('../../../../src/app/features/governance/ProposalDetail', () => ({
    ProposalDetail: ({ proposalId }: { proposalId: string }) => (
        <div data-testid="proposal-detail">detail:{proposalId}</div>
    ),
}));

vi.mock('../../../../src/app/features/governance/useProposals', () => ({
    useProposals: () => ({ data: mockProposals, loading: false, error: null }),
    useVotes: (proposalId: string) => ({
        data: voteByProposal[proposalId] ?? [],
        loading: false,
        error: null,
    }),
    useGovernanceDiagnostics: () => ({
        invalidProposalEvents: 0,
        invalidVoteEvents: 0,
        migratedProposalEvents: 0,
        migratedVoteEvents: 0,
        duplicateVoteEventsDropped: 0,
    }),
    useProposalResult: (proposalId: string) => ({
        data: {
            computedStatus: proposalId === 'proposal-a' ? 'active' : 'passed',
            voteCount: proposalId === 'proposal-a' ? 1 : 3,
        },
        loading: false,
        error: null,
    }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderDashboard = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    store.set(userIdAtom, '@me:example.org');

    act(() => {
        root.render(
            <Provider store={store}>
                <GovernanceDashboard roomId="!room:example.org" />
            </Provider>,
        );
    });

    mountedRoots.push(root);
    return container;
};

describe('GovernanceDashboard sections', () => {
    beforeEach(() => {
        mockProposals = [proposalA, proposalB];
        voteByProposal = {
            'proposal-a': [
                {
                    eventId: 'vote-new',
                    proposalEventId: 'proposal-a',
                    voterId: '@me:example.org',
                    choice: 'yes',
                    timestamp: 101,
                    schemaVersion: 1,
                    migrated: false,
                },
            ],
            'proposal-b': [],
        };
    });

    afterEach(() => {
        act(() => {
            mountedRoots.splice(0).forEach((root) => root.unmount());
        });
        document.body.innerHTML = '';
    });

    it('renders Active and Past sections via tabs', () => {
        const container = renderDashboard();

        expect(container.textContent).toContain('Active Proposals');
        expect(container.textContent).toContain('card:Enable feature A');

        const pastTab = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Past',
        ) as HTMLButtonElement;
        act(() => pastTab.click());

        expect(container.textContent).toContain('Past Proposals');
        expect(container.textContent).toContain('card:Retire feature B');
    });

    it('renders Create and Results sections', () => {
        const container = renderDashboard();

        const createTab = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Create',
        ) as HTMLButtonElement;
        act(() => createTab.click());
        expect(container.querySelector('[data-testid="proposal-creator"]')).toBeTruthy();

        const resultsTab = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Results',
        ) as HTMLButtonElement;
        act(() => resultsTab.click());
        expect(container.textContent).toContain('Computed status: active');
        expect(container.textContent).toContain('Computed status: passed');
    });

    it('renders My Votes using latest vote per proposal and opens ProposalDetail', () => {
        const container = renderDashboard();

        const myVotesTab = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'My Votes',
        ) as HTMLButtonElement;
        act(() => myVotesTab.click());

        expect(container.textContent).toContain('My Votes');
        expect(container.textContent).toContain('Your vote: yes');
        expect(container.textContent).not.toContain('Retire feature B');

        const openButton = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'View / Change Vote',
        ) as HTMLButtonElement;
        act(() => openButton.click());

        expect(container.querySelector('[data-testid="proposal-detail"]')?.textContent).toContain(
            'detail:proposal-a',
        );
    });
});
