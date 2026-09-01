import { style } from '@vanilla-extract/css';

export const wrapper = style({ display: 'grid', gap: 12 });

export const heading = style({ margin: 0, fontSize: 15, fontWeight: 600 });

export const hint = style({
    margin: 0,
    fontSize: 12,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const list = style({ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' });

export const row = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'var(--bg-input, #14201A)',
});

export const label = style({ flex: 1, fontSize: 14 });

export const hiddenLabel = style({ opacity: 0.55 });

export const iconButton = style({
    padding: '4px 8px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    selectors: { '&:disabled': { opacity: 0.35, cursor: 'not-allowed' } },
});

export const paletteGrid = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8,
});

export const paletteCard = style({
    display: 'grid',
    gap: 4,
    padding: 10,
    borderRadius: 12,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    selectors: { '&:disabled': { cursor: 'not-allowed' } },
});

export const paletteActive = style({ borderColor: 'var(--accent-primary, #D7FF3F)' });

/** A locked palette is dimmed but still shown, with what it takes. */
export const paletteLocked = style({ opacity: 0.6 });

export const swatchRow = style({ display: 'flex', gap: 4 });

export const swatch = style({ width: 16, height: 16, borderRadius: 4 });

export const paletteName = style({ fontSize: 13, fontWeight: 600 });

export const paletteMeta = style({
    fontSize: 11,
    color: 'var(--text-secondary, #9BB3A4)',
});
