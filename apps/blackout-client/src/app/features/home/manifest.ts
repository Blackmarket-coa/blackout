import type { BlackoutFeature, ShellPanelEntry } from '../../core/features/types';
import { homeNavItems } from './nav';

const homePanels: ShellPanelEntry[] = [
    {
        id: 'home.sidebar',
        kind: 'sidebar',
        label: 'Home',
        to: '/',
        order: 10,
    },
];

export const homeFeature: BlackoutFeature = {
    id: 'home',
    name: 'Home',
    customizations: [
        {
            id: 'home-shell',
            name: 'Home Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['home'],
            },
            navItems: homeNavItems,
            panels: homePanels,
        },
    ],
    capabilities: ['home.read'],
};
