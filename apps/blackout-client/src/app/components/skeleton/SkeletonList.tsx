import React, { type CSSProperties } from 'react';
import * as css from './SkeletonList.css';

export type SkeletonListProps = {
    /** Number of placeholder blocks. */
    count?: number;
    /** Height of each placeholder block, in px. */
    height?: number;
    /** `grid` mirrors card grids (auto-fill, 240px min); `list` stacks rows. */
    layout?: 'list' | 'grid';
    /** Announced to assistive tech while loading, e.g. "Loading streams". */
    label: string;
    style?: CSSProperties;
    'data-testid'?: string;
};

/**
 * Pulsing placeholder blocks shown while a list loads. Gives "still loading"
 * a different shape from the dashed empty-state panel, so an empty result is
 * never mistaken for a pending one (and vice versa).
 */
export function SkeletonList({
    count = 3,
    height = 96,
    layout = 'list',
    label,
    style,
    'data-testid': testId,
}: SkeletonListProps) {
    return (
        <div
            className={layout === 'grid' ? css.grid : css.list}
            style={style}
            role="status"
            aria-busy="true"
            aria-label={label}
            data-testid={testId}
        >
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className={css.block} style={{ height }} aria-hidden />
            ))}
        </div>
    );
}

export default SkeletonList;
