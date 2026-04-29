import type { BlackoutFeature } from '../../core/features/types';
import {
    callDialpadPanels,
    callElementPanels,
    mediaPipelinePanels,
} from './panels';
import {
    callDialpadRoutes,
    callElementRoutes,
    mediaPipelineRoutes,
} from './routes';
import { callSettings, mediaPipelineSettings } from './settings';

/**
 * Media + call feature module — BKL-006.
 *
 * Three customizations gated by separate capabilities so admins can grant
 * the dialpad without granting Element Call (and vice versa). All three
 * ride behind the `mediaCall` flag so the default canonical shell stays
 * unchanged until operators opt in.
 */
export const mediaCallFeature: BlackoutFeature = {
    id: 'media-call',
    name: 'Media & Call',
    customizations: [
        {
            id: 'media-pipeline',
            name: 'Media Pipeline',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['media.pipeline.read'],
                flags: ['mediaCall'],
            },
            routes: mediaPipelineRoutes,
            panels: mediaPipelinePanels,
            settings: mediaPipelineSettings,
        },
        {
            id: 'call-dialpad',
            name: 'PSTN Dialpad',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['call.dialpad.launch'],
                flags: ['mediaCall'],
            },
            routes: callDialpadRoutes,
            panels: callDialpadPanels,
            settings: [callSettings[0]],
        },
        {
            id: 'call-element',
            name: 'Element Call',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['call.element.launch'],
                flags: ['mediaCall'],
            },
            routes: callElementRoutes,
            panels: callElementPanels,
            settings: [callSettings[1]],
        },
    ],
    capabilities: [
        'media.pipeline.read',
        'call.dialpad.launch',
        'call.element.launch',
    ],
};
