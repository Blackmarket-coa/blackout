import { style } from '@vanilla-extract/css';
import { config } from 'folds';

/**
 * Picker layout: vertical stack of full-width tappable cards on mobile.
 * Spacing and rounding mirror CreateRoomForm conventions so the modal
 * doesn't feel like two different products glued together.
 */
export const PickerStep = style({
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S400,
});

export const PickerCardList = style({
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
});

export const PickerNav = style({
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: config.space.S200,
});

/**
 * The reveal screen's playbook-name panel sits above the inputs and gives the
 * archetype the visual weight of a tabletop playbook title — solid label,
 * generous spacing, no decorative chrome.
 */
export const RevealHeader = style({
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    padding: config.space.S400,
    borderRadius: config.radii.R400,
});

export const RevealActions = style({
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
});
