import type { BlackoutFeature } from '../../core/features/types';
import { governanceNavItems } from './nav';
import {
    governanceMeetingPanels,
    governancePanels,
    governanceRightPanelTabs,
    governanceTreasuryPanels,
} from './panels';
import { governanceRoutes } from './routes';
import {
    governanceMeetingsSettings,
    governanceTreasurySettings,
} from './settings';

const baseRoutes = governanceRoutes.filter(
    (route) => route.path === '/governance' || route.path === '/governance/new'
);
const meetingRoutes = governanceRoutes.filter(
    (route) => route.path === '/governance/meetings'
);
const treasuryRoutes = governanceRoutes.filter(
    (route) => route.path === '/governance/treasury'
);

export const governanceFeature: BlackoutFeature = {
    id: 'governance',
    name: 'Governance',
    customizations: [
        {
            id: 'governance-workbench',
            name: 'Governance Workbench',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['governance.read'],
                flags: ['governance'],
            },
            routes: baseRoutes,
            navItems: governanceNavItems,
            panels: [...governancePanels, ...governanceRightPanelTabs],
        },
        {
            id: 'governance-meetings',
            name: 'Governance Meetings',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['governance.read', 'governance.meetings.schedule'],
                flags: ['governance'],
            },
            routes: meetingRoutes,
            panels: governanceMeetingPanels,
            settings: governanceMeetingsSettings,
        },
        {
            id: 'governance-treasury',
            name: 'Governance Treasury',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['governance.read', 'governance.treasury.read'],
                flags: ['governance'],
            },
            routes: treasuryRoutes,
            panels: governanceTreasuryPanels,
            settings: governanceTreasurySettings,
        },
    ],
    capabilities: [
        'governance.read',
        'governance.write',
        'governance.meetings.schedule',
        'governance.treasury.read',
    ],
};
