import React from 'react';
import { designSpacing } from '@blackout/design';

export interface InlineProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Gap between children, in px. Defaults to the compact spacing token. */
    gap?: number;
    align?: React.CSSProperties['alignItems'];
}

/**
 * Single-line horizontal group of items with consistent spacing. Unlike
 * `Cluster` it does not wrap — use it for inline control rows.
 */
export const Inline = React.forwardRef<HTMLDivElement, InlineProps>(
    function Inline(
        { gap = designSpacing.compactGapPx, align = 'center', style, children, ...rest },
        ref,
    ) {
        return (
            <div
                ref={ref}
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap,
                    alignItems: align,
                    ...style,
                }}
                {...rest}
            >
                {children}
            </div>
        );
    },
);
