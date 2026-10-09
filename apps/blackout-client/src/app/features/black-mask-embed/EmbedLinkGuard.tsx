import React, { useCallback, type MouseEvent, type ReactNode } from 'react';
import {
    decideEmbedLink,
    EMBED_OPEN_ATTRIBUTE,
    EMBED_OPEN_IN_TAB,
    openInNewTopLevelTab,
} from './embedLinks';

type EmbedLinkGuardProps = {
    children: ReactNode;
    /**
     * Route a same-origin link the panel shows. Absent when there is no panel
     * router yet (signed out): such links are then swallowed, leaving the
     * visitor on the sign-in card.
     */
    onInPanel?: (path: string) => void;
};

/**
 * Catches every link click inside the panel, in the capture phase so it runs
 * before react-router's `<Link>` handler, and applies the panel's link rule
 * (`decideEmbedLink`): stay in the panel, or open a new top-level tab — never
 * navigate the frame. Covers links in message HTML too, since those are plain
 * anchors inside this subtree (portals included: React routes their events
 * through the component tree).
 *
 * Programmatic navigation (`navigate('/coliseum')`) does not pass through
 * here; the panel router's catch-all route handles that case.
 */
export const EmbedLinkGuard = ({ children, onInPanel }: EmbedLinkGuardProps) => {
    const onClickCapture = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            const target = event.target as Element | null;
            const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!anchor) return;
            // A download link saves a file; it does not navigate the frame.
            if (anchor.hasAttribute('download')) return;

            const decision = decideEmbedLink(
                anchor.getAttribute('href') ?? '',
                window.location.origin,
                { forceTab: anchor.getAttribute(EMBED_OPEN_ATTRIBUTE) === EMBED_OPEN_IN_TAB }
            );
            if (decision.action === 'default') return;

            event.preventDefault();
            event.stopPropagation();
            if (decision.action === 'in-panel') {
                onInPanel?.(decision.path);
            } else if (decision.action === 'blackout-tab' || decision.action === 'external-tab') {
                openInNewTopLevelTab(decision.url);
            }
        },
        [onInPanel]
    );

    return (
        <div
            data-embed-link-guard=""
            onClickCapture={onClickCapture}
            style={{ display: 'contents' }}
        >
            {children}
        </div>
    );
};

export default EmbedLinkGuard;
