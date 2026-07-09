import { keyframes, style } from '@vanilla-extract/css';

export const container = style({
    position: 'relative',
    height: '100%',
    width: '100%',
    minHeight: 0,
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    WebkitOverflowScrolling: 'touch',
    background: '#000',
    outline: 'none',
});

export const slide = style({
    position: 'relative',
    height: '100%',
    minHeight: '100%',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    color: '#fff',
    touchAction: 'pan-y',
});

export const media = style({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
});

export const textCard = style({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px 180px',
});

export const textCardBody = style({
    margin: 0,
    fontSize: 22,
    lineHeight: 1.45,
    fontWeight: 600,
    textAlign: 'center',
    maxWidth: 640,
    textShadow: '0 1px 12px rgba(0,0,0,0.45)',
});

/** Bottom-left metadata overlay (author, body, citations). */
export const overlay = style({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '20px 84px 24px 16px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
});

/** TikTok-style right action rail. */
export const rail = style({
    position: 'absolute',
    right: 8,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
    zIndex: 3,
});

export const railButton = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    border: 'none',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    padding: 0,
});

export const railIcon = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.14)',
    backdropFilter: 'blur(4px)',
    transition: 'transform 120ms ease, background 120ms ease',
    selectors: {
        [`${railButton}:active &`]: { transform: 'scale(0.9)' },
    },
});

export const railIconActive = style({
    background: 'rgba(26,188,156,0.55)',
});

export const railLabel = style({
    fontSize: 11,
    fontWeight: 700,
    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
});

/** Video progress hairline pinned to the slide's bottom edge. */
export const progressTrack = style({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    background: 'rgba(255,255,255,0.18)',
    zIndex: 4,
});

export const progressFill = style({
    height: '100%',
    background: 'var(--accent-primary, #1ABC9C)',
});

/** Top chrome: position pill + mute toggle. */
export const topChrome = style({
    position: 'absolute',
    top: 10,
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
});

export const positionPill = style({
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    pointerEvents: 'none',
});

export const chromeButton = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    cursor: 'pointer',
});

const heartPop = keyframes({
    '0%': { transform: 'scale(0.4)', opacity: 0 },
    '25%': { transform: 'scale(1.15)', opacity: 1 },
    '60%': { transform: 'scale(1)', opacity: 1 },
    '100%': { transform: 'scale(1.4)', opacity: 0 },
});

export const heartBurst = style({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 110,
    pointerEvents: 'none',
    zIndex: 6,
    animation: `${heartPop} 650ms ease forwards`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.9 },
    },
});

export const flashOverlay = style({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 96,
    pointerEvents: 'none',
    zIndex: 6,
});

export const pausedBadge = style({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 64,
    color: 'rgba(255,255,255,0.85)',
    pointerEvents: 'none',
    zIndex: 5,
    textShadow: '0 2px 16px rgba(0,0,0,0.6)',
});

/** Desktop-only prev/next buttons. */
export const navButton = style({
    position: 'absolute',
    right: 70,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    selectors: {
        '&:disabled': { opacity: 0.35, cursor: 'default' },
    },
});

/** One-time gesture hint overlay. */
export const hintOverlay = style({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    zIndex: 8,
    padding: 24,
    textAlign: 'center',
});

export const hintTitle = style({
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
});

export const hintLine = style({
    margin: 0,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
});

export const hintButton = style({
    marginTop: 8,
    padding: '10px 22px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
});

export const topicChip = style({
    alignSelf: 'flex-start',
    padding: '3px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const bodyText = style({
    margin: 0,
    fontSize: 15,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
});

export const metaRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
});

export const statusToast = style({
    position: 'absolute',
    top: 54,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 999,
    fontSize: 12,
    zIndex: 7,
});

/** Pill (top-left) showing/leaving the topic-scoped reel. */
export const topicScopePill = style({
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 6,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    maxWidth: '60%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const messageState = style({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-secondary, #aaa)',
    padding: 24,
    textAlign: 'center',
});

export const skeletonSlide = style({
    position: 'absolute',
    inset: 16,
    borderRadius: 20,
});
