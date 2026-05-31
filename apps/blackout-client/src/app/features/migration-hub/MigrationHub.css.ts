import { style } from '@vanilla-extract/css';

export const Page = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    padding: '24px',
    maxWidth: '880px',
    margin: '0 auto',
});

export const Section = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
});

export const SectionTitle = style({
    fontWeight: 600,
    fontSize: '1.1rem',
});

export const Row = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
});

export const Muted = style({
    opacity: 0.7,
    fontSize: '0.9rem',
});

export const Cards = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
});

export const Card = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.04)',
});

export const CardValue = style({
    fontSize: '1.5rem',
    fontWeight: 700,
});
