import { useEffect, useState, type CSSProperties } from 'react';
import { BugReportWidgetModal } from './BugReportWidgetModal';

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

const buttonStyle: CSSProperties = {
  position: 'fixed',
  // Clear the bottom tab bar / message composer. The mobile shell renders a
  // bottom tab bar (~64px) and rooms render a composer; offset above both.
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
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

export const BugReportFab = () => {
  const [open, setOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();

  return (
    <>
      {!open && !keyboardOpen && (
        <button
          type="button"
          style={buttonStyle}
          aria-label="Report a problem"
          title="Report a problem"
          data-testid="bug-report-fab"
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
