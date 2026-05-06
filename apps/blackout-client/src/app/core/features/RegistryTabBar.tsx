import { createElement, type ComponentType, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { buildFeatureRegistry } from './buildRegistry';
import { defaultFeatureFlags, type FeatureFlags } from './featureFlags';
import { useCapabilityContext } from './capabilityContext';
import { composeShellPanels, selectPanelsByKind } from './composition';
import type { ShellPanelEntry, ShellPanelKind } from './types';
import { isShellPathActive } from '../../pages/shell/modeRouter';

const styles = {
    bar: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        background: 'var(--bg-nav, #1f2937)',
        borderTop: '1px solid var(--border-default, #374151)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        gap: 0,
    },
    item: {
        flex: 1,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '8px 4px',
        minHeight: 56,
        textDecoration: 'none',
        color: 'var(--text-muted, #9ca3af)',
        fontSize: 11,
        lineHeight: 1.2,
        fontWeight: 500,
    },
    itemActive: {
        color: 'var(--text-primary, #f8fafc)',
    },
    iconWrap: {
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
} as const satisfies Record<string, CSSProperties>;

export type RegistryTabBarProps = {
    /**
     * Which `ShellPanelKind` to render. Defaults to `'mobile-tab'`. Reusing
     * the same component for the desktop rail is intentional — pass
     * `'sidebar'` and the consumer decides on layout via `barStyle`.
     */
    kind?: ShellPanelKind;
    /**
     * The currently-active path. Passed in so callers can pick whether to
     * use `useLocation` (default in AppShell) or a different source like
     * the URL hash for non-router contexts.
     */
    pathname: string;
    /**
     * Optional filter applied after registry composition. Used by AppShell
     * to keep the bottom-tab bar at exactly five destinations even when
     * additional features register `kind: 'mobile-tab'` panels later.
     */
    filter?: (entry: ShellPanelEntry) => boolean;
    /**
     * Optional renderer for empty state. Default returns null so the bar
     * disappears when no panels are registered (e.g. legacy shell mode).
     */
    renderEmpty?: () => JSX.Element | null;
    barStyle?: CSSProperties;
    itemStyle?: CSSProperties;
    activeItemStyle?: CSSProperties;
    'data-testid'?: string;
};

const registryForContext = (flags: Record<string, boolean>): FeatureFlags =>
    ({ ...defaultFeatureFlags, ...flags } as FeatureFlags);

/**
 * Renders a tab bar from feature-registry shell panels of a given kind.
 * Reads the active capability context, composes panels, applies an
 * optional filter, and emits a Link per entry. Active state is computed
 * from the `pathname` prop via `isShellPathActive`.
 *
 * Consumers should pass a stable `kind` prop because changing it remounts
 * the underlying panel list.
 */
export const RegistryTabBar = ({
    kind = 'mobile-tab',
    pathname,
    filter,
    renderEmpty,
    barStyle,
    itemStyle,
    activeItemStyle,
    ...rest
}: RegistryTabBarProps): JSX.Element | null => {
    const ctx = useCapabilityContext();
    const flags = (ctx.flags ?? {}) as Record<string, boolean>;
    const registry = buildFeatureRegistry(registryForContext(flags));
    const panels = selectPanelsByKind(composeShellPanels(registry, ctx), kind);
    const visible = filter ? panels.filter(filter) : panels;

    if (visible.length === 0) {
        return renderEmpty ? renderEmpty() : null;
    }

    return (
        <nav
            aria-label={kind === 'mobile-tab' ? 'Primary destinations' : kind}
            data-testid={rest['data-testid'] ?? 'registry-tab-bar'}
            style={{ ...styles.bar, ...barStyle }}
        >
            {visible.map((entry) => {
                const active = isShellPathActive(pathname, entry.to);
                const Icon = entry.icon as ComponentType | undefined;
                return (
                    <Link
                        key={entry.id}
                        to={entry.to}
                        aria-current={active ? 'page' : undefined}
                        data-active={active ? 'true' : 'false'}
                        data-panel-id={entry.id}
                        style={{
                            ...styles.item,
                            ...(itemStyle ?? {}),
                            ...(active ? { ...styles.itemActive, ...(activeItemStyle ?? {}) } : {}),
                        }}
                    >
                        <span style={styles.iconWrap} aria-hidden="true">
                            {Icon ? createElement(Icon) : null}
                        </span>
                        <span>{entry.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default RegistryTabBar;
