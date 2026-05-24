import { Children, type CSSProperties, type ReactNode, useEffect, useState } from 'react';

const placeholderStyle: CSSProperties = {
    minHeight: 72,
    borderRadius: 12,
    border: '1px dashed var(--border-default, #374151)',
    opacity: 0.35,
};

export interface StaggeredMountProps {
    children: ReactNode;
    /** Delay between successive child mounts. */
    delayMs?: number;
}

/**
 * Mounts its children progressively: the first child immediately, each
 * subsequent child after `index * delayMs`. The stacked integration panels in
 * the streaming hub each fire a data fetch on mount; without staggering they
 * burst in the same tick and — combined with the SDK client's retry — trip the
 * API rate limiter (HTTP 429). Until a child mounts it reserves space with a
 * lightweight placeholder so the layout doesn't jump.
 */
export const StaggeredMount = ({ children, delayMs = 200 }: StaggeredMountProps): JSX.Element => {
    const items = Children.toArray(children);
    const [mountedCount, setMountedCount] = useState(items.length > 0 ? 1 : 0);

    useEffect(() => {
        const total = items.length;
        if (total <= 1) return;
        const timers: ReturnType<typeof setTimeout>[] = [];
        for (let i = 1; i < total; i += 1) {
            timers.push(
                setTimeout(() => {
                    setMountedCount((current) => Math.max(current, i + 1));
                }, i * delayMs),
            );
        }
        return () => {
            timers.forEach((timer) => clearTimeout(timer));
        };
        // Scheduled once per child-count/delay; mountedCount advances via the timers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length, delayMs]);

    return (
        <>
            {items.map((child, index) =>
                index < mountedCount ? (
                    child
                ) : (
                    <div
                        key={`staggered-placeholder-${index}`}
                        style={placeholderStyle}
                        aria-hidden
                        data-testid="staggered-placeholder"
                    />
                ),
            )}
        </>
    );
};

export default StaggeredMount;
