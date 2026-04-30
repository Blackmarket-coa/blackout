import React, { createElement } from 'react';
import { Link } from 'react-router-dom';
import { buildFeatureRegistry } from './buildRegistry';
import { composeShellPanels, selectPanelsByKind } from './composition';
import { defaultFeatureFlags, type FeatureFlags } from './featureFlags';
import { useCapabilityContext } from './capabilityContext';
import type { ShellPanelKind } from './types';

type RegistrySidebarListProps = {
    /** Which shell surface this list materializes. Defaults to `sidebar`. */
    kind?: ShellPanelKind;
    /** Optional className applied to the outer `<nav>`. */
    className?: string;
};

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
}: RegistrySidebarListProps) {
    const ctx = useCapabilityContext();
    const registry = buildFeatureRegistry(
        { ...defaultFeatureFlags, ...(ctx.flags ?? {}) } as FeatureFlags
    );
    const panels = selectPanelsByKind(composeShellPanels(registry, ctx), kind);

    if (panels.length === 0) return null;

    return (
        <nav
            className={className}
            data-testid={`registry-${kind}-list`}
            aria-label={`Feature ${kind} entries`}
        >
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {panels.map((panel) => (
                    <li key={panel.id}>
                        <Link
                            to={panel.to}
                            data-testid={`registry-panel-${panel.id}`}
                            data-panel-kind={panel.kind}
                        >
                            {panel.icon ? createElement(panel.icon) : null}
                            <span>{panel.label}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
