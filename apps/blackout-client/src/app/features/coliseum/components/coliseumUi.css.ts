import { keyframes, style, styleVariants } from '@vanilla-extract/css';

/**
 * Shared Coliseum design language. Everything reads the semantic CSS custom
 * properties (`--bg-surface`, `--accent-primary`, …) so the arena palette
 * override in `coliseumArenaTheme.css.ts` keeps applying to the whole subtree.
 */

/** Single centered feed column (Twitter-like) with safe-area bottom clearance. */
export const feedColumn = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    maxWidth: 640,
    margin: '0 auto',
    padding: '12px 16px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
    boxSizing: 'border-box',
});

export const card = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 16,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    textAlign: 'left',
});

export const cardInteractive = style([
    card,
    {
        cursor: 'pointer',
        transition: 'background 120ms ease',
        selectors: {
            '&:hover': { background: 'var(--bg-surface-hover, var(--bg-surface))' },
        },
    },
]);

export const cardHeaderRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
});

export const cardTitle = style({
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.35,
});

export const mutedText = style({
    fontSize: 13,
    color: 'var(--text-secondary)',
});

export const mutedLink = style([
    mutedText,
    {
        textDecoration: 'none',
        selectors: { '&:hover': { textDecoration: 'underline' } },
    },
]);

/** Horizontally scrollable row of filter chips. */
export const chipRow = style({
    display: 'flex',
    gap: 8,
    padding: '10px 16px 2px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    selectors: { '&::-webkit-scrollbar': { display: 'none' } },
});

const chipBase = {
    flexShrink: 0,
    padding: '5px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600 as const,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
};

export const chip = style(chipBase);

export const chipActive = style({
    ...chipBase,
    background: 'var(--accent-primary, #1ABC9C)',
    borderColor: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
});

export const tagChip = style({
    fontSize: 11,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    padding: '2px 8px',
    borderRadius: 999,
});

export const tagRow = style({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
});

/**
 * Floating action button (compose), offset above the mobile bottom tab bar.
 * The 84px base offset is the shared FAB base slot — keep it in sync with
 * `BASE_BOTTOM_PX` in `src/app/hooks/useFabStack.ts`.
 */
export const fab = style({
    position: 'fixed',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
    right: 20,
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    border: 'none',
    cursor: 'pointer',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontSize: 26,
    lineHeight: 1,
    boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
    padding: 0,
});

/** Sticky bottom bar that opens the composer sheet (Twitter reply bar style). */
export const stickyComposerBar = style({
    position: 'sticky',
    bottom: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
    background: 'var(--bg-nav, var(--bg-surface))',
    borderTop: '1px solid var(--border-default)',
});

export const composerBarPrompt = style({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
});

/** Twitter-style row of small transparent action buttons under a post. */
export const actionRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
});

export const actionButton = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
    selectors: {
        '&:hover': {
            background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))',
            color: 'var(--text-primary)',
        },
        '&:disabled': { cursor: 'progress', opacity: 0.6 },
    },
});

/** Stance badge — colored via the `--stance-color` var set inline per stance. */
export const stanceBadge = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--stance-color)',
    background: 'color-mix(in srgb, var(--stance-color) 16%, transparent)',
});

export const stanceBar = style({
    display: 'flex',
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    background: 'var(--bg-input)',
});

/** Small circular avatar built from the author's initial. */
export const avatarCircle = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: '50%',
    flexShrink: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    background: 'var(--accent-muted, #333)',
    textTransform: 'uppercase',
});

export const authorLine = style({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
});

export const authorName = style({
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const authorMeta = style({
    fontSize: 12,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
});

const pulse = keyframes({
    '0%': { opacity: 0.45 },
    '50%': { opacity: 1 },
    '100%': { opacity: 0.45 },
});

/** Loading skeleton block. */
export const skeleton = style({
    borderRadius: 12,
    background: 'var(--bg-input)',
    animation: `${pulse} 1.4s ease-in-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});

/** Left thread line for nested replies (Twitter conversation style). */
export const threadChildren = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginLeft: 17,
    paddingLeft: 14,
    borderLeft: '2px solid var(--border-default)',
});

/** Live pulse dot for active sessions. */
export const liveDot = style({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--danger, #ff5247)',
    animation: `${pulse} 1.2s ease-in-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});

/** Rows inside the "More" sheet. */
export const moreSheetList = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
});

export const moreSheetRow = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '12px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    selectors: {
        '&:hover': { background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))' },
    },
});

export const moreSheetRowActive = style({
    background: 'var(--bg-input)',
});

export const moreSheetRowTitle = style({
    fontSize: 15,
    fontWeight: 700,
});

export const moreSheetRowDescription = style({
    fontSize: 12.5,
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
});

/** Section heading used across restyled tabs. */
export const sectionTitle = style({
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
});

export const toolbarRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px 0',
});

/** Variants preserved for places that want fixed stance classes. */
export const stanceText = styleVariants({
    for: { color: '#1ABC9C' },
    against: { color: '#E74C3C' },
    nuance: { color: '#F1C40F' },
});
