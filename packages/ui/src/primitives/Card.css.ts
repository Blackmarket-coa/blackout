import { style } from '@vanilla-extract/css';
import {
    designColors,
    designRadii,
    designSpacing,
} from '@blackout/design';

export const base = style({
    background: designColors.bgSurface,
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.lgPx,
    padding: designSpacing.comfortableGapPx,
    color: designColors.textPrimary,
});
