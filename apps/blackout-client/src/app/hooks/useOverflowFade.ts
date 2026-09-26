import { useCallback, useEffect, useRef } from 'react';

const FADE_PX = 28;
// Sub-pixel rounding keeps scrollLeft a hair short of the true end.
const EDGE_EPSILON_PX = 2;
const ACTIVE_SELECTOR = '[aria-selected="true"], [aria-pressed="true"], [aria-current="page"]';

const maskFor = (fadeStart: boolean, fadeEnd: boolean): string => {
    if (!fadeStart && !fadeEnd) return '';
    const start = fadeStart ? `transparent 0, #000 ${FADE_PX}px` : '#000 0';
    const end = fadeEnd ? `#000 calc(100% - ${FADE_PX}px), transparent 100%` : '#000 100%';
    return `linear-gradient(to right, ${start}, ${end})`;
};

const applyFade = (el: HTMLElement) => {
    const maxScroll = el.scrollWidth - el.clientWidth;
    const fadeStart = el.scrollLeft > EDGE_EPSILON_PX;
    const fadeEnd = maxScroll - el.scrollLeft > EDGE_EPSILON_PX;
    const mask = maskFor(fadeStart, fadeEnd);
    el.style.maskImage = mask;
    el.style.setProperty('-webkit-mask-image', mask);
    el.dataset.overflowStart = fadeStart ? 'true' : 'false';
    el.dataset.overflowEnd = fadeEnd ? 'true' : 'false';
};

// Bring the selected tab/chip fully into view without touching vertical
// scroll (Element.scrollIntoView would also scroll ancestors vertically).
const revealActive = (el: HTMLElement) => {
    const active = el.querySelector<HTMLElement>(ACTIVE_SELECTOR);
    if (!active) return;
    const left =
        active.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const right = left + active.getBoundingClientRect().width;
    if (left < el.scrollLeft + FADE_PX) {
        el.scrollLeft = Math.max(0, left - FADE_PX);
    } else if (right > el.scrollLeft + el.clientWidth - FADE_PX) {
        el.scrollLeft = right - el.clientWidth + FADE_PX;
    }
};

/**
 * Callback ref for a horizontally scrolling row (tab strip, chip row). Fades
 * whichever edge still has content beyond it so a cropped last tab reads as
 * "scroll for more" instead of looking like the end of the row, and keeps the
 * selected item scrolled into view. Works with any background because it
 * masks the row's own content rather than painting an overlay.
 *
 * Selection changes are picked up automatically from `aria-selected` /
 * `aria-pressed` / `aria-current`; `activeKey` is an optional extra trigger.
 */
export const useOverflowFade = <T extends HTMLElement>(activeKey?: unknown) => {
    const nodeRef = useRef<T | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    const ref = useCallback((el: T | null) => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        nodeRef.current = el;
        if (!el) return;

        const update = () => applyFade(el);
        el.addEventListener('scroll', update, { passive: true });
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        resize?.observe(el);
        const mutation =
            typeof MutationObserver === 'undefined'
                ? null
                : new MutationObserver((records) => {
                      // A selection change (aria-pressed/-selected flipping)
                      // should also scroll the newly active item into view.
                      if (records.some((record) => record.type === 'attributes')) {
                          revealActive(el);
                      }
                      update();
                  });
        mutation?.observe(el, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-selected', 'aria-pressed', 'aria-current'],
        });
        revealActive(el);
        update();

        cleanupRef.current = () => {
            el.removeEventListener('scroll', update);
            resize?.disconnect();
            mutation?.disconnect();
        };
    }, []);

    useEffect(() => {
        const el = nodeRef.current;
        if (!el) return;
        revealActive(el);
        applyFade(el);
    }, [activeKey]);

    useEffect(() => () => cleanupRef.current?.(), []);

    return ref;
};
