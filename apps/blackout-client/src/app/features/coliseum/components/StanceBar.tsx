import React, { useMemo } from 'react';
import type { ColiseumStance } from '@blackout/core';
import { STANCE_COLOR } from './stance';
import * as css from './coliseumUi.css';

/**
 * Horizontal for/nuance/against distribution bar (extracted from DebateTab's
 * StancePie so the reel, topic cards, and thread header all share it).
 */
export function StanceBar({
    items,
    'aria-label': ariaLabel = 'Stance distribution',
}: {
    items: ReadonlyArray<{ stance: ColiseumStance }>;
    'aria-label'?: string;
}) {
    const totals = useMemo(() => {
        const counts: Record<ColiseumStance, number> = { for: 0, against: 0, nuance: 0 };
        for (const item of items) counts[item.stance] += 1;
        const total = counts.for + counts.against + counts.nuance;
        if (total === 0) return null;
        return {
            for: (counts.for / total) * 100,
            against: (counts.against / total) * 100,
            nuance: (counts.nuance / total) * 100,
        };
    }, [items]);

    if (!totals) return null;

    return (
        <div className={css.stanceBar} aria-label={ariaLabel} data-testid="coliseum-stance-bar">
            <span style={{ width: `${totals.for}%`, background: STANCE_COLOR.for }} />
            <span style={{ width: `${totals.nuance}%`, background: STANCE_COLOR.nuance }} />
            <span style={{ width: `${totals.against}%`, background: STANCE_COLOR.against }} />
        </div>
    );
}

export default StanceBar;
