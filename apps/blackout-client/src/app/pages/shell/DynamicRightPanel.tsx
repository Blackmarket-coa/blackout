import { type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { useLocation } from 'react-router-dom';
import { rightPanelDescriptorAtom } from '../../state/navigation';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { buildFeatureRegistry } from '../../core/features/buildRegistry';
import { defaultFeatureFlags, type FeatureFlags } from '../../core/features/featureFlags';
import { useCapabilityContext } from '../../core/features/capabilityContext';
import { composeShellPanels, selectPanelsByKind } from '../../core/features/composition';
import type { ShellPanelEntry } from '../../core/features/types';
import { RightPanelTabBar } from './RightPanelTabBar';

const firstSegment = (pathname: string): string => {
    const match = pathname.match(/^\/([^/?#]+)/);
    return match ? match[1] : '';
};

const useRightPanelEntriesForPath = (pathname: string): readonly ShellPanelEntry[] => {
    const ctx = useCapabilityContext();
    const flags = { ...defaultFeatureFlags, ...(ctx.flags ?? {}) } as FeatureFlags;
    const registry = buildFeatureRegistry(flags);
    const panels = selectPanelsByKind(composeShellPanels(registry, ctx), 'right-panel');
    const segment = firstSegment(pathname);
    if (!segment) return [];
    return panels.filter((entry) => firstSegment(entry.to) === segment);
};

const PANEL_STYLE: CSSProperties = {
    width: 320,
    minWidth: 320,
    maxWidth: 360,
    flexShrink: 0,
    height: '100%',
    background: 'var(--bg-surface, #0f172a)',
    borderLeft: '1px solid var(--border-default, #374151)',
    color: 'var(--text-primary, #f8fafc)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const BODY_STYLE: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
    fontSize: 13,
    color: 'var(--text-muted, #9ca3af)',
};

/**
 * AppShell right-panel slot. Switch-renders by the current
 * `rightPanelDescriptorAtom` so each destination owns the descriptor
 * variant it produces, and the shell stays decoupled from feature
 * internals.
 *
 * In PR 1 the descriptor surfaces are placeholders — they render
 * lightweight "coming in PR N" copy. Subsequent PRs swap each block for
 * the real component (community-info / livestream-chat / product-detail
 * / creator-profile / dm-thread / event-rsvp) without touching the
 * AppShell wiring.
 */
export const DynamicRightPanel = () => {
    const descriptor = useAtomValue(rightPanelDescriptorAtom);
    const location = useLocation();
    const registryEntries = useRightPanelEntriesForPath(location.pathname);

    // ClientLayout owns its own right panel for legacy room views; the
    // shell-level slot must stay hidden so we never paint two side-by-side.
    if (descriptor.kind === 'legacy-room') {
        return null;
    }

    // When there are no descriptors AND no registry-driven tabs, render
    // nothing — keeps the shell-level slot invisible on routes that
    // don't have a right-panel surface.
    if (descriptor.kind === 'none' && registryEntries.length === 0) {
        return null;
    }

    let body: JSX.Element | null = null;
    switch (descriptor.kind) {
        case 'none':
            body = null;
            break;
        case 'community-info':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>{BLACKOUT_TERMS.canopy.title} info</h2>
                    <p>Members, pinned messages, and canopy settings appear here.</p>
                </div>
            );
            break;
        case 'product-detail':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>Product</h2>
                    <p>Listing detail + embedded checkout (PR 3).</p>
                </div>
            );
            break;
        case 'livestream-chat':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>Stream chat</h2>
                    <p>Matrix den timeline overlay + tip CTA (PR 4).</p>
                </div>
            );
            break;
        case 'creator-profile':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>Creator</h2>
                    <p>Storefront, subscriptions, streams (PR 4).</p>
                </div>
            );
            break;
        case 'dm-thread':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>Direct message</h2>
                    <p>Thread detail (PR 1).</p>
                </div>
            );
            break;
        case 'event-rsvp':
            body = (
                <div>
                    <h2 style={{ marginTop: 0 }}>Event</h2>
                    <p>RSVP and agenda (PR 6).</p>
                </div>
            );
            break;
        default: {
            // Legacy-room is handled above with an early return; the switch
            // here is exhaustive for the remaining narrowed kinds.
            const exhaustiveCheck: never = descriptor;
            void exhaustiveCheck;
            body = <div />;
        }
    }

    return (
        <aside
            style={PANEL_STYLE}
            data-shell-region="right-panel"
            data-right-panel-kind={descriptor.kind}
        >
            {registryEntries.length > 0 ? <RightPanelTabBar /> : null}
            {body ? <div style={BODY_STYLE}>{body}</div> : null}
        </aside>
    );
};

export default DynamicRightPanel;
