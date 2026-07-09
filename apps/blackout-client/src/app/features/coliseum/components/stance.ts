import type { ColiseumStance } from '@blackout/core';

/**
 * Single source of truth for stance presentation. Every Coliseum surface
 * (reel, debate thread, badges, bars) reads labels/colors from here instead of
 * re-declaring them per tab.
 */
export const STANCE_ORDER: readonly ColiseumStance[] = ['for', 'against', 'nuance'];

export const STANCE_LABEL: Record<ColiseumStance, string> = {
    for: 'For',
    against: 'Against',
    nuance: 'Nuance',
};

export const STANCE_COLOR: Record<ColiseumStance, string> = {
    for: '#1ABC9C',
    against: '#E74C3C',
    nuance: '#F1C40F',
};

/** Translucent tint of the stance color, for chips/backgrounds ("33" = 20% alpha). */
export function stanceTint(stance: ColiseumStance, alphaHex = '33'): string {
    return `${STANCE_COLOR[stance]}${alphaHex}`;
}
