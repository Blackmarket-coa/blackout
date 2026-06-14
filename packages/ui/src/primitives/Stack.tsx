import React from 'react';
import { designSpacing } from '@blackout/design';

export type StackDirection = 'row' | 'column';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
    direction?: StackDirection;
    /** Gap between children, in px. Defaults to the compact spacing token. */
    gap?: number;
    align?: React.CSSProperties['alignItems'];
    justify?: React.CSSProperties['justifyContent'];
    wrap?: boolean;
}

/**
 * Flexbox layout primitive. `direction="row"` is an HStack;
 * `direction="column"` is a VStack.
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(function Stack(
    {
        direction = 'row',
        gap = designSpacing.compactGapPx,
        align,
        justify,
        wrap = false,
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
                flexDirection: direction,
                gap,
                alignItems: align,
                justifyContent: justify,
                flexWrap: wrap ? 'wrap' : undefined,
                ...style,
            }}
            {...rest}
        >
            {children}
        </div>
    );
});
