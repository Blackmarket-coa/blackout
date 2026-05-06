import { useEffect, useState } from 'react';

/**
 * Tracks `window.innerWidth` reactively. Reads safely in non-browser
 * environments (jsdom, SSR) by treating an absent `window` as a default
 * desktop viewport so layout effects don't trigger mobile-only branches
 * in tests that haven't set a viewport.
 */
export const useViewportWidth = (): number => {
    const initialWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const [width, setWidth] = useState<number>(initialWidth);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return width;
};
