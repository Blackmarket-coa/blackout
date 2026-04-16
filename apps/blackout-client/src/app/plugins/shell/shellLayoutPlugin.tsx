import React, { Suspense, lazy } from 'react';
import type { UISlotRegistry } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';
import { clientShellLayoutMetrics } from '../../pages/client/layoutMetrics';
import { settingsLayoutMetrics } from '../../features/settings/SettingsPage';

const LegacyClientLayout = lazy(() => import('../../pages/client/LegacyClientLayout'));

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

export const shellLayoutPlugin = {
    id: 'shell.legacy-layout' as const,
    hasLegacyFallbackEnabled: (): boolean => isRuntimePluginEnabled('shell.legacy-layout'),
    renderLegacyFallbackLayout: (): JSX.Element => (
        <Suspense fallback={null}>
            <LegacyClientLayout />
        </Suspense>
    ),
    // Back-compat aliases while call sites migrate to explicit fallback naming.
    isEnabled(): boolean {
        return this.hasLegacyFallbackEnabled();
    },
    renderLegacyLayout(): JSX.Element {
        return this.renderLegacyFallbackLayout();
    },
};
