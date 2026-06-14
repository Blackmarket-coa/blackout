import React from 'react';
import { designSpacing } from '@blackout/design';

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Gap between cells, in px. Defaults to the comfortable spacing token. */
    gap?: number;
    /** Fixed number of equal-width columns. */
    columns?: number;
    /**
     * Responsive auto-fill: each column is at least this many px wide. Ignored
     * when `columns` is set.
     */
    minItemWidth?: number;
}

/** CSS-grid layout primitive. */
export const Grid = React.forwardRef<HTMLDivElement, GridProps>(function Grid(
    { gap = designSpacing.comfortableGapPx, columns, minItemWidth, style, children, ...rest },
    ref,
) {
    const gridTemplateColumns = columns
        ? `repeat(${columns}, minmax(0, 1fr))`
        : minItemWidth
          ? `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`
          : undefined;
    return (
        <div
            ref={ref}
            style={{ display: 'grid', gap, gridTemplateColumns, ...style }}
            {...rest}
        >
            {children}
        </div>
    );
});
