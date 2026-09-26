import { useEffect, useState, type RefObject } from 'react';

// Ignore jitter from momentum scrolling and rubber-banding.
const DIRECTION_THRESHOLD_PX = 8;
// Never hide while the user is still near the top of a scroller.
const TOP_REVEAL_ZONE_PX = 48;

/**
 * Returns `true` while the user is scrolling down inside `containerRef`
 * (or any nested vertical scroller), and `false` as soon as they scroll back
 * up or return to the top. Used by the mobile shell to tuck the bottom tab
 * bar away so it doesn't permanently stack on top of the browser's own
 * bottom toolbar.
 *
 * `scroll` doesn't bubble, so the listener is registered in the capture
 * phase to observe nested scrollers too. Horizontal scrolling (chip rows,
 * tab strips) never changes `scrollTop` and is therefore ignored.
 */
export const useHideOnScrollDown = (
    containerRef: RefObject<HTMLElement>,
    enabled: boolean,
    /** Changing this (e.g. the route pathname) reveals the bar again. */
    resetKey?: unknown
): boolean => {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        setHidden(false);
    }, [resetKey]);

    useEffect(() => {
        const container = containerRef.current;
        if (!enabled || !container) {
            setHidden(false);
            return undefined;
        }
        const lastTop = new WeakMap<EventTarget, number>();
        const onScroll = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const top = target.scrollTop;
            const previous = lastTop.get(target);
            lastTop.set(target, top);
            if (top <= TOP_REVEAL_ZONE_PX) {
                setHidden(false);
                return;
            }
            if (previous === undefined) return;
            const delta = top - previous;
            if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) {
                // Keep accumulating small movements against the older anchor.
                lastTop.set(target, previous);
                return;
            }
            setHidden(delta > 0);
        };
        container.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => container.removeEventListener('scroll', onScroll, { capture: true });
    }, [containerRef, enabled]);

    return hidden;
};
