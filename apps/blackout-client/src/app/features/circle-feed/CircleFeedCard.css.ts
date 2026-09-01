import { style } from '@vanilla-extract/css';

export const card = style({
    display: 'grid',
    gap: 8,
    padding: '14px 16px',
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'var(--bg-input, #14201A)',
});

export const header = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const ringBadge = style({
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: 10,
});

export const title = style({ margin: 0, fontSize: 15, fontWeight: 600 });

export const body = style({
    margin: 0,
    fontSize: 14,
    color: 'var(--text-secondary, #9BB3A4)',
});

/** Shown when the underlying post could not be loaded but its chain still can. */
export const unavailable = style({
    margin: 0,
    fontSize: 14,
    fontStyle: 'italic',
    color: 'var(--text-secondary, #9BB3A4)',
});

export const actions = style({ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 });

export const relayButton = style({
    padding: '6px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
    selectors: {
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
});

export const relayButtonActive = style({
    borderColor: 'var(--accent-primary, #D7FF3F)',
    color: 'var(--accent-primary, #D7FF3F)',
});

export const noteInput = style({
    flex: 1,
    minWidth: 0,
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'var(--bg-surface, #101A14)',
    color: 'inherit',
    fontSize: 13,
});

export const error = style({ margin: 0, fontSize: 12, color: 'var(--danger, #FF8C8C)' });
