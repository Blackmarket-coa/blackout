import React, { useEffect, useState } from 'react';
import * as css from './coliseumUi.css';

/**
 * Detect an on-screen keyboard on mobile: when it opens, visualViewport height
 * shrinks well below the layout viewport — hide the FAB so it doesn't float
 * over the keyboard. (Same heuristic as the bug-report FAB.)
 */
function useKeyboardOpen(): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return undefined;
        const onResize = () => {
            setOpen(window.innerHeight - vv.height > 160);
        };
        vv.addEventListener('resize', onResize);
        onResize();
        return () => vv.removeEventListener('resize', onResize);
    }, []);
    return open;
}

/** Floating compose button (TikTok/Twitter "+"), hidden while typing. */
export function ColiseumFab({
    label,
    onClick,
    'data-testid': testId,
    children = '+',
}: {
    label: string;
    onClick: () => void;
    'data-testid'?: string;
    children?: React.ReactNode;
}) {
    const keyboardOpen = useKeyboardOpen();
    if (keyboardOpen) return null;
    return (
        <button
            type="button"
            className={css.fab}
            aria-label={label}
            title={label}
            data-testid={testId}
            onClick={onClick}
        >
            <span aria-hidden>{children}</span>
        </button>
    );
}

export default ColiseumFab;
