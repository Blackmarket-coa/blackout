import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/bmc-navigation';
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

const GovernanceMeetingsRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Governance Meetings'),
        createElement(
            'p',
            null,
            'Scheduling surface placeholder. Backed by `scheduleMeeting`/`listMeetings` SDK actions and `blackout.governance.meeting.scheduled` events; UI is gated on the canonical scheduler component port.'
        )
    );

const GovernanceTreasuryRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Governance Treasury'),
        createElement(
            'p',
            null,
            'Treasury snapshot surface placeholder. Backed by `getTreasurySnapshot`/`listTreasurySnapshots` SDK actions and `blackout.governance.treasury.snapshot.published` events.'
        )
    );

export const governanceRoutes: FeatureRoute[] = [
    { path: '/governance', component: GovernanceRoutePage },
    { path: '/governance/new', component: GovernanceCreateRoutePage },
    { path: '/governance/meetings', component: GovernanceMeetingsRoutePage },
    { path: '/governance/treasury', component: GovernanceTreasuryRoutePage },
];
