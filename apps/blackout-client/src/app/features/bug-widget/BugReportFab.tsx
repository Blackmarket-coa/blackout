import { useEffect, useState, type CSSProperties } from 'react';
import { BugReportWidgetModal } from './BugReportWidgetModal';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { isMobileViewport } from '../../pages/client/layoutMetrics';

// Detect an on-screen keyboard on mobile: when it opens, visualViewport height
// shrinks well below the layout viewport. Hide the FAB so it doesn't float over
// the keyboard / get pinned to the wrong place.
const useKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const onResize = () => {
      setOpen(window.innerHeight - vv.height > 160);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);
  return open;
};

// How long after the last scroll event the docked tab slides back in.
const SCROLL_SETTLE_MS = 700;

// True while any scroller on the page is moving. `scroll` doesn't bubble, so
// listen in the capture phase to see nested scroll containers.
const useScrolling = (enabled: boolean): boolean => {
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let timer: number | undefined;
    const onScroll = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), SCROLL_SETTLE_MS);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [enabled]);
  return scrolling;
};

// Sits above the bottom tab bar (AppShell publishes its current height as
// `--shell-bottom-bar-inset`, 0 when the bar is tucked away) plus the home
// indicator safe area.
const BOTTOM_OFFSET =
  'calc(env(safe-area-inset-bottom, 0px) + var(--shell-bottom-bar-inset, 64px) + 20px)';

const desktopStyle: CSSProperties = {
  position: 'fixed',
  bottom: BOTTOM_OFFSET,
  right: 20,
  zIndex: 9000,
  width: 48,
  height: 48,
  borderRadius: 24,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--accent-primary, #2563eb)',
  color: '#fff',
  fontSize: 22,
  lineHeight: '48px',
  textAlign: 'center',
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
  padding: 0,
};

// On phones a 48px circle floating over the content column covers buttons
// and text on nearly every screen. Dock it instead as a slim tab flush with
// the right edge (outside the content's usual 16px gutter) that slides away
// entirely while the user scrolls.
const mobileStyle: CSSProperties = {
  ...desktopStyle,
  right: 0,
  width: 28,
  height: 40,
  borderRadius: '10px 0 0 10px',
  fontSize: 15,
  lineHeight: '40px',
  opacity: 0.85,
  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  transition: 'transform 160ms ease-out, bottom 180ms ease-out',
};

const mobileHiddenStyle: CSSProperties = {
  ...mobileStyle,
  transform: 'translateX(100%)',
  pointerEvents: 'none',
};

export const BugReportFab = () => {
  const [open, setOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const mobile = isMobileViewport(useViewportWidth());
  const scrolling = useScrolling(mobile);

  let style = desktopStyle;
  if (mobile) style = scrolling ? mobileHiddenStyle : mobileStyle;

  return (
    <>
      {!open && !keyboardOpen && (
        <button
          type="button"
          style={style}
          aria-label="Report a problem"
          title="Report a problem"
          data-testid="bug-report-fab"
          data-docked={mobile ? 'true' : 'false'}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden>🐞</span>
        </button>
      )}
      {open && <BugReportWidgetModal onClose={() => setOpen(false)} />}
    </>
  );
};

export default BugReportFab;
