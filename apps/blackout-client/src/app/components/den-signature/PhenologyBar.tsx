import React from 'react';
import type { PlaybookPhase } from '@blackout/protocol';
import {
    PHENOLOGY_TOKENS,
    phenologyPhaseOrder,
} from '../../styles/playbookTokens';
import * as css from './DenSignature.css';

/**
 * Thin five-segment bar that carries the den's seasonal/lifecycle state.
 * Active phase is solid; surrounding phases are softly tinted. The bar is
 * deliberately 3px tall so it reads as a *band under the name* rather than
 * a progress meter — it's a glanceable hint, not a thing to act on.
 *
 * The phase tokens (spring/summer/autumn/winter/compost) come from
 * `playbookTokens.ts`. Compost is a muted brown, not red — the brief is firm
 * that ended dens are *renewal*, not *failure*.
 */
export interface PhenologyBarProps {
    phase: PlaybookPhase;
    title?: string;
}

export function PhenologyBar({ phase, title }: PhenologyBarProps) {
    const activeToken = PHENOLOGY_TOKENS[phase] ?? PHENOLOGY_TOKENS.summer;
    return (
        <div
            className={css.PhenologyBarRoot}
            role="img"
            aria-label={title ?? activeToken.label}
        >
            {phenologyPhaseOrder.map((segment) => {
                const token = PHENOLOGY_TOKENS[segment];
                const isActive = segment === phase;
                return (
                    <span
                        key={segment}
                        className={css.PhenologySegment}
                        style={{ background: isActive ? token.solid : token.soft }}
                    />
                );
            })}
        </div>
    );
}
