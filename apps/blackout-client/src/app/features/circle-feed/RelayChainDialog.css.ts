import { style } from '@vanilla-extract/css';

export const backdrop = style({
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    background: 'color-mix(in srgb, #000 62%, transparent)',
    zIndex: 60,
});

export const panel = style({
    width: 'min(480px, 100%)',
    maxHeight: '80vh',
    overflowY: 'auto',
    padding: 20,
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'var(--bg-surface, #101A14)',
    color: 'var(--text-primary, #E8F5EC)',
});

export const title = style({ margin: '0 0 4px', fontSize: 16, fontWeight: 600 });

export const subtitle = style({
    margin: '0 0 16px',
    fontSize: 13,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const list = style({ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' });

export const hopRow = style({
    display: 'grid',
    gap: 2,
    paddingInlineStart: 14,
    borderInlineStart: '2px solid var(--border-default, #2E5A42)',
});

export const hopName = style({ fontSize: 14, fontWeight: 600 });

export const withdrawn = style({ textDecoration: 'line-through', opacity: 0.65 });

export const hopMeta = style({ fontSize: 12, color: 'var(--text-secondary, #9BB3A4)' });

export const note = style({
    margin: '4px 0 0',
    fontSize: 13,
    fontStyle: 'italic',
    color: 'var(--text-primary, #E8F5EC)',
});

export const origin = style({
    marginTop: 14,
    paddingTop: 12,
    borderTop: '1px solid var(--border-default, #2E5A42)',
    fontSize: 13,
    color: 'var(--text-secondary, #9BB3A4)',
});

export const closeButton = style({
    marginTop: 18,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
});
