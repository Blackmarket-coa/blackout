import React from 'react';
import type { UISlotRegistry } from '../contracts';
import { clientShellLayoutMetrics } from '../../pages/client/layoutMetrics';
import { settingsLayoutMetrics } from '../../features/settings/SettingsPage';

export type ShellMonetizationSlotProps = {
    roomId: string;
    panelPaddingPx: number;
    sectionGapPx: number;
    itemGapPx: number;
    minTouchTargetPx: number;
};

export type ShellMonetizationSlotName = 'summary' | 'actions';
export type ShellMonetizationSlotRenderer = (props: ShellMonetizationSlotProps) => JSX.Element;
export type ShellMonetizationSlotRegistry = UISlotRegistry<
    ShellMonetizationSlotName,
    ShellMonetizationSlotProps
>;

const baselineMonetizationSlotRegistry: ShellMonetizationSlotRegistry = {
    summary: ({ roomId }) => (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Monetization tools for room <code>{roomId}</code>.
        </p>
    ),
    actions: ({ itemGapPx, minTouchTargetPx }) => (
        <div style={{ display: 'grid', gap: itemGapPx }}>
            {['Subscriptions', 'Boosts', 'Marketplace', 'Quests', 'Payouts & Analytics'].map(
                (label) => (
                    <button
                        key={label}
                        type="button"
                        style={{
                            textAlign: 'left',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '8px 10px',
                            minHeight: minTouchTargetPx,
                        }}
                    >
                        {label}
                    </button>
                )
            )}
        </div>
    ),
};

export const buildShellMonetizationSlotProps = (roomId: string): ShellMonetizationSlotProps => ({
    roomId,
    panelPaddingPx: settingsLayoutMetrics.panelPaddingPx,
    sectionGapPx: clientShellLayoutMetrics.panelGapPx,
    itemGapPx: settingsLayoutMetrics.itemGapPx,
    minTouchTargetPx: settingsLayoutMetrics.minTouchTargetPx,
});

export const resolveShellMonetizationSlotRegistry = (): ShellMonetizationSlotRegistry =>
    baselineMonetizationSlotRegistry;

// The legacy fallback render path was retired in PR-10. The plugin
// keeps its `id` and the monetization slot helpers because consumers
// (right-panel, parity tests) still depend on those exports. The
// legacy methods are now stubs returning `false` / `null` so any
// stale call site fails closed rather than throwing.
export const shellLayoutPlugin = {
    id: 'shell.legacy-layout' as const,
    hasLegacyFallbackEnabled: (): boolean => false,
    renderLegacyFallbackLayout: (): JSX.Element | null => null,
    isEnabled(): boolean {
        return false;
    },
    renderLegacyLayout(): JSX.Element | null {
        return null;
    },
};
