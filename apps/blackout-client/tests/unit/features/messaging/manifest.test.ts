import { describe, expect, it } from 'vitest';
import {
    composeFeatureRoutes,
    composeShellPanels,
} from '../../../../src/app/core/features/composition';
import { messagingFeature } from '../../../../src/app/features/messaging/manifest';
import { resolveMessagingTab } from '../../../../src/app/features/messaging/messagingTabs';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';

const context = (messaging: boolean) =>
    ({
        capabilities: [],
        flags: { ...defaultFeatureFlags, messaging },
    } as never);

describe('messaging feature registration', () => {
    it('registers all five /messages routes when the flag is on', () => {
        const paths = composeFeatureRoutes([messagingFeature], context(true)).map((r) => r.path);
        expect(paths).toEqual([
            '/messages/',
            '/messages/locked-in/',
            '/messages/locked-in/create/',
            '/messages/notifications/',
            '/messages/invites/',
        ]);
    });

    it('registers a sidebar panel pointing at the messaging hub', () => {
        const panels = composeShellPanels([messagingFeature], context(true));
        expect(panels).toEqual([
            expect.objectContaining({
                id: 'messaging.sidebar',
                kind: 'sidebar',
                to: '/messages/',
            }),
        ]);
    });

    it('registers nothing when the messaging flag is off', () => {
        expect(composeFeatureRoutes([messagingFeature], context(false))).toEqual([]);
        expect(composeShellPanels([messagingFeature], context(false))).toEqual([]);
    });
});

describe('resolveMessagingTab', () => {
    it('maps each /messages address onto its tab', () => {
        expect(resolveMessagingTab('/messages/')).toBe('dms');
        expect(resolveMessagingTab('/messages/locked-in/')).toBe('dms');
        expect(resolveMessagingTab('/messages/locked-in/create/')).toBe('create');
        expect(resolveMessagingTab('/messages/notifications/')).toBe('notifications');
        expect(resolveMessagingTab('/messages/invites/')).toBe('invites');
    });
});
