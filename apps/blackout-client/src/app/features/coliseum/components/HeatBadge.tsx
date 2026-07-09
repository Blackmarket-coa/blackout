import React from 'react';
import * as css from './coliseumUi.css';

/** "How hot is this debate" badge — 0..1 heat rendered as degrees. */
export function HeatBadge({ heat }: { heat: number }) {
    return (
        <span
            className={css.stanceBadge}
            style={
                {
                    '--stance-color': 'var(--warning, #e0a23c)',
                } as React.CSSProperties
            }
            data-testid="coliseum-heat-badge"
        >
            🔥 {Math.round(heat * 100)}°
        </span>
    );
}

export default HeatBadge;
