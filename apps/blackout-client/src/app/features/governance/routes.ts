import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/navigation';
import type { FeatureRoute } from '../../core/features/types';
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

export const governanceRoutes: FeatureRoute[] = [
    { path: '/governance', component: GovernanceRoutePage },
    { path: '/governance/new', component: GovernanceCreateRoutePage },
];
