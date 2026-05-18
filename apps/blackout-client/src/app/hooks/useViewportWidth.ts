import { useEffect, useState } from 'react';

const readWidth = (): number => {
    if (typeof window === 'undefined') return 1280;
    // visualViewport reflects the area not obscured by virtual keyboards
    // and pinch-zoom on iOS Safari and Android Chrome, where the legacy
    // `window.resize` event does not fire on soft-keyboard open. Falling
    // back to innerWidth keeps desktop and jsdom callers unchanged.
    const visual = window.visualViewport?.width;
    return typeof visual === 'number' ? visual : window.innerWidth;
};

/**
 * Tracks the visible viewport width reactively, preferring
 * `window.visualViewport.width` so that mobile virtual keyboards
 * collapse layout to the actually-visible area. Reads safely in
 * non-browser environments (jsdom, SSR) by treating an absent `window`
 * as a default desktop viewport so layout effects don't trigger
 * mobile-only branches in tests that haven't set a viewport.
 */
export const useViewportWidth = (): number => {
    const [width, setWidth] = useState<number>(readWidth);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setWidth(readWidth());
        window.addEventListener('resize', onResize);
        const visual = window.visualViewport;
        visual?.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            visual?.removeEventListener('resize', onResize);
        };
    }, []);

    return width;
};
