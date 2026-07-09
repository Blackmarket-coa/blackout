import React, { type CSSProperties } from 'react';
import type { ColiseumStance } from '@blackout/core';
import { STANCE_COLOR, STANCE_LABEL } from './stance';
import * as css from './coliseumUi.css';

export function StanceBadge({
    stance,
    children,
}: {
    stance: ColiseumStance;
    /** Optional extra content rendered after the label (e.g. counts). */
    children?: React.ReactNode;
}) {
    return (
        <span
            className={css.stanceBadge}
            style={{ '--stance-color': STANCE_COLOR[stance] } as CSSProperties}
            data-stance={stance}
        >
            {STANCE_LABEL[stance]}
            {children}
        </span>
    );
}

export default StanceBadge;
