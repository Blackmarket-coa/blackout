import { style } from '@vanilla-extract/css';

export const wrapper = style({ display: 'grid', gap: 12, padding: 16 });

export const header = style({ display: 'grid', gap: 4 });

export const heading = style({ margin: 0, fontSize: 18, fontWeight: 700 });

export const subheading = style({
    margin: 0,
    fontSize: 13,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const ringFilter = style({ display: 'flex', gap: 8, marginTop: 4 });

export const pill = style({
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
});

export const pillActive = style({
    borderColor: 'var(--accent-primary, #D7FF3F)',
    color: 'var(--accent-primary, #D7FF3F)',
});

export const list = style({ display: 'grid', gap: 12 });

export const empty = style({
    padding: '24px 16px',
    borderRadius: 18,
    border: '1px dashed var(--border-default, #2E5A42)',
    fontSize: 14,
    color: 'var(--text-secondary, #9BB3A4)',
    textAlign: 'center',
});

export const runToggle = style({
    justifySelf: 'start',
    padding: '6px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'var(--text-secondary, #9BB3A4)',
    fontSize: 13,
    cursor: 'pointer',
});

export const illumination = style({
    display: 'grid',
    gap: 4,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid var(--border-default, #2E5A42)',
    fontSize: 12,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const meterTrack = style({
    height: 6,
    borderRadius: 999,
    background: 'color-mix(in srgb, var(--border-default, #2E5A42) 70%, transparent)',
    overflow: 'hidden',
});

export const meterFill = style({
    height: '100%',
    background: 'var(--accent-primary, #D7FF3F)',
});
