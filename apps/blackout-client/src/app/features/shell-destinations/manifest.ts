import type { BlackoutFeature, CapabilityGate } from '../../core/features/types';
import { shellDestinationPanels } from './panels';

/**
 * Registers the five canonical AppShell destinations as registry
 * mobile-tab panels. Every panel is gated by the `shellAppShell` flag so
 * the rollout is reversible — when the flag is off, BottomTabBar finds
 * zero entries and renders nothing.
 *
 * Each destination is additionally gated by the same flags/capabilities
 * that gate its target route (see the owning feature's manifest), so
 * disabling a feature hides its tab instead of leaving a tab that lands
 * on the 404 catch-all. `shell.home` needs no extra gate: `/` is a
 * static route that always exists.
 *
 * This feature deliberately registers only panels (no routes, no
 * navItems) because the destination bodies are owned by their feature
 * managers (HomeFeed/ClientLayout for `/`, the streaming, coalition,
 * coliseum, and profile features for the rest).
 */
const DESTINATION_GATES: Record<string, CapabilityGate> = {
    'shell.home': { flags: ['shellAppShell'] },
    // Mirrors features/streaming/manifest.ts.
    'shell.streams': { flags: ['shellAppShell', 'streaming'] },
    // Mirrors features/coalition/manifest.ts.
    'shell.coalition': { flags: ['shellAppShell', 'coalition'] },
    // Mirrors features/coliseum/manifest.ts.
    'shell.coliseum': { flags: ['shellAppShell', 'coliseum'] },
    // Mirrors features/profile/manifest.ts, including the capability gate.
    'shell.profile': { allOf: ['profile.read'], flags: ['shellAppShell', 'profile'] },
};

export const shellDestinationsFeature: BlackoutFeature = {
    id: 'shell-destinations',
    name: 'AppShell Destinations',
    customizations: shellDestinationPanels.map((panel) => ({
        id: `shell-destinations.tabs.${panel.id}`,
        name: `AppShell tab · ${panel.label}`,
        category: 'visual/layout plugin',
        capabilityGate: DESTINATION_GATES[panel.id] ?? { flags: ['shellAppShell'] },
        panels: [panel],
    })),
};
