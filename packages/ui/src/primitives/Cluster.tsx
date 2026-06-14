import React from 'react';
import { designSpacing } from '@blackout/design';

export interface ClusterProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Gap between children, in px. Defaults to the compact spacing token. */
    gap?: number;
    justify?: React.CSSProperties['justifyContent'];
    align?: React.CSSProperties['alignItems'];
}

/**
 * Wrapping group of items (chips, tags, actions) that flows onto multiple
 * lines while keeping consistent spacing.
 */
export const Cluster = React.forwardRef<HTMLDivElement, ClusterProps>(
    function Cluster(
        {
            gap = designSpacing.compactGapPx,
            justify = 'flex-start',
            align = 'center',
            style,
            children,
            ...rest
        },
        ref,
    ) {
        return (
            <div
                ref={ref}
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap,
                    justifyContent: justify,
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
