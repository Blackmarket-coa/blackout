import React, { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router';
import { buildFeatureRegistry } from './buildRegistry';
import { composeShellPanels, selectPanelsByKind } from './composition';
import { defaultFeatureFlags, type FeatureFlags } from './featureFlags';
import { useCapabilityContext } from './capabilityContext';
import { getAllFeaturePlugins, subscribeFeaturePlugins } from './plugins';
import type { ShellPanelEntry, ShellPanelKind } from './types';
import { isShellPathActive } from '../../pages/shell/modeRouter';
import { installedPluginPanelsAtom } from '../../features/monetization/install/installedPluginPanelsAtom';

export type RegistrySidebarMode = 'list' | 'rail';

type RegistrySidebarListProps = {
    /** Which shell surface this list materializes. Defaults to `sidebar`. */
    kind?: ShellPanelKind;
    /** Optional className applied to the outer `<nav>`. */
    className?: string;
    /**
     * `list` (default) renders accessible nav links with labels visible.
     * `rail` renders fixed-size icon buttons suited to the 64px primary
     * rail; the `panel.label` becomes the tooltip and the accessible name.
     */
    mode?: RegistrySidebarMode;
    /** Pathname of the active route, used to mark the current rail item. */
    activePath?: string;
    /**
     * Optional post-composition filter. Lets a consumer drop entries that
     * are already surfaced elsewhere (e.g. the shell top nav owns the
     * primary destinations, so the left sidebar excludes them).
     */
    filter?: (entry: ShellPanelEntry) => boolean;
    /** `list` mode: inline style for each link. */
    itemStyle?: React.CSSProperties;
    /** `list` mode: inline style merged in when the link is active. */
    activeItemStyle?: React.CSSProperties;
};

const RAIL_BUTTON_SIZE = 40;

const railLinkStyle = (active: boolean): React.CSSProperties => ({
    width: RAIL_BUTTON_SIZE,
    height: RAIL_BUTTON_SIZE,
    borderRadius: 12,
    border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    fontSize: 16,
    outlineOffset: 2,
});

/**
 * Emits registry-declared shell panels as accessible nav links for the
 * given `kind`. Renders nothing when the capability context grants no
 * matching panels (so empty surfaces don't pollute the layout).
 *
 * The legacy room/space sidebar (`useSidebarItems`) stays untouched; this
 * component is meant to live next to it as a discrete feature-panel
 * region inside the shell.
 */
export function RegistrySidebarList({
    kind = 'sidebar',
    className,
    mode = 'list',
    activePath,
    filter,
    itemStyle,
    activeItemStyle,
}: RegistrySidebarListProps) {
    const ctx = useCapabilityContext();
    const [plugins, setPlugins] = useState(() => getAllFeaturePlugins());
    useEffect(() => subscribeFeaturePlugins(setPlugins), []);
    const registry = buildFeatureRegistry(
        { ...defaultFeatureFlags, ...(ctx.flags ?? {}) } as FeatureFlags,
        plugins
    );
    const registryPanels = selectPanelsByKind(composeShellPanels(registry, ctx), kind);
    const installedPluginPanels = useAtomValue(installedPluginPanelsAtom);

    const panels = useMemo<ShellPanelEntry[]>(() => {
        const ordered =
            kind !== 'sidebar' || installedPluginPanels.length === 0
                ? registryPanels
                : [...registryPanels, ...installedPluginPanels]
                      .map((entry, insertion) => ({ entry, insertion }))
                      .sort((left, right) => {
                          const leftOrder = left.entry.order ?? Number.POSITIVE_INFINITY;
                          const rightOrder = right.entry.order ?? Number.POSITIVE_INFINITY;
                          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                          return left.insertion - right.insertion;
                      })
                      .map(({ entry }) => entry);
        return filter ? ordered.filter(filter) : ordered;
    }, [kind, registryPanels, installedPluginPanels, filter]);

    const itemsRef = useRef<Array<HTMLAnchorElement | null>>([]);

    if (panels.length === 0) return null;

    const activeIndex = activePath ? panels.findIndex((panel) => panel.to === activePath) : -1;

    const focusItem = (index: number) => {
        const target = itemsRef.current[index];
        if (target) target.focus();
    };

    const onRailKeyDown =
        (index: number): React.KeyboardEventHandler<HTMLAnchorElement> =>
        (event) => {
            if (panels.length < 2) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                focusItem((index + 1) % panels.length);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                focusItem((index - 1 + panels.length) % panels.length);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                focusItem(0);
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                focusItem(panels.length - 1);
            }
        };

    if (mode === 'rail') {
        return (
            <nav
                className={className}
                data-testid={`registry-${kind}-rail`}
                aria-label={`Feature ${kind} entries`}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    alignItems: 'center',
                }}
            >
                {panels.map((panel, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <Link
                            key={panel.id}
                            ref={(el) => {
                                itemsRef.current[index] = el;
                            }}
                            to={panel.to}
                            data-testid={`registry-panel-${panel.id}`}
                            data-panel-kind={panel.kind}
                            data-active={isActive ? 'true' : undefined}
                            aria-label={panel.label}
                            aria-current={isActive ? 'page' : undefined}
                            title={panel.label}
                            tabIndex={
                                activeIndex === -1 ? (index === 0 ? 0 : -1) : isActive ? 0 : -1
                            }
                            onKeyDown={onRailKeyDown(index)}
                            style={railLinkStyle(isActive)}
                        >
                            {panel.icon ? (
                                createElement(panel.icon)
                            ) : (
                                <span aria-hidden>{panel.label.charAt(0).toUpperCase()}</span>
                            )}
                        </Link>
                    );
                })}
            </nav>
        );
    }

    return (
        <nav
            className={className}
            data-testid={`registry-${kind}-list`}
            aria-label={`Feature ${kind} entries`}
        >
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {panels.map((panel) => {
                    const active = activePath ? isShellPathActive(activePath, panel.to) : false;
                    return (
                        <li key={panel.id}>
                            <Link
                                to={panel.to}
                                data-testid={`registry-panel-${panel.id}`}
                                data-panel-kind={panel.kind}
                                data-active={active ? 'true' : undefined}
                                aria-current={active ? 'page' : undefined}
                                style={{
                                    ...(itemStyle ?? {}),
                                    ...(active ? activeItemStyle ?? {} : {}),
                                }}
                            >
                                {panel.icon ? createElement(panel.icon) : null}
                                <span>{panel.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
