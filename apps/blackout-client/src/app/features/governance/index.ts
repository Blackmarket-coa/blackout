import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/navigation';
import type { BlackoutFeature } from '../../core/features/types';
import { ProposalCreator } from './ProposalCreator';
import { GovernanceDashboard } from './GovernanceDashboard';

const GovernanceRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to open Governance.');
    }

    return createElement(GovernanceDashboard, { roomId });
};

const GovernanceCreateRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to create a proposal.');
    }

    return createElement(ProposalCreator, { roomId });
};

export const governanceFeature: BlackoutFeature = {
    id: 'governance',
    name: 'Governance',
    routes: [
        { path: '/governance', component: GovernanceRoutePage },
        { path: '/governance/new', component: GovernanceCreateRoutePage },
    ],
    navItems: [{ label: 'Governance', to: '/governance' }],
    capabilities: ['governance.read', 'governance.write'],
};

export * from './useProposals';
export * from './ProposalCreator';
export * from './ProposalCard';
export * from './ProposalDetail';
export * from './GovernanceDashboard';
export * from './eventSchemas';
