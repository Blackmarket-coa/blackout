import { useAtom } from 'jotai';
import { rightPanelAtom } from '../../../state/navigation';
import { useDismissOnOutsideOrEscape } from '../../room/useDismissOnOutsideOrEscape';
import { NotificationsDrawer } from './NotificationsDrawer';

/**
 * Mobile/tablet mount for the per-room notifications drawer.
 *
 * The desktop right-panel slot (`RoomRightPanelHost`) only mounts at
 * `ScreenSize.Desktop`, so the notifications icon in the room header was
 * a no-op below ~1124px — tapping it set `rightPanelAtom` but nothing
 * rendered. This component wires the same atom to a fixed-positioned
 * bottom-sheet so non-desktop viewports reach the drawer.
 *
 * The sheet sits on a backdrop, dismisses on Escape and on backdrop tap,
 * and reuses the existing `NotificationsDrawer` body without duplication.
 * Drag-to-dismiss is intentionally NOT implemented here — the brief calls
 * out a v1 cut, and the close affordance + backdrop already cover dismissal.
 */
export interface NotificationsBottomSheetProps {
    roomId: string;
}

const styles = {
    backdrop: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 80,
    },
    sheet: {
        position: 'absolute' as const,
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '70vh',
        overflowY: 'auto' as const,
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingTop: 4,
        paddingLeft: 8,
        paddingRight: 8,
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.25)',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 999,
        background: 'var(--border-default)',
        margin: '6px auto 8px',
    },
    closeRow: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 4,
    },
    close: {
        border: '1px solid var(--border-default)',
        borderRadius: 999,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: 12,
        padding: '2px 10px',
        cursor: 'pointer',
    },
};

export function NotificationsBottomSheet({ roomId }: NotificationsBottomSheetProps) {
    const [panel, setPanel] = useAtom(rightPanelAtom);
    const open = panel === 'notifications';
    const close = () => setPanel(null);

    // Escape-only via the shared hook; backdrop-tap is handled inline so
    // taps inside the sheet don't bubble back up.
    useDismissOnOutsideOrEscape(open, null, close);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-label="Notifications"
            style={styles.backdrop}
            onClick={close}
            data-testid="notifications-bottom-sheet"
        >
            <div style={styles.sheet} onClick={(event) => event.stopPropagation()}>
                <div style={styles.handle} aria-hidden />
                <div style={styles.closeRow}>
                    <button
                        type="button"
                        style={styles.close}
                        onClick={close}
                        data-testid="notifications-bottom-sheet-close"
                    >
                        Close
                    </button>
                </div>
                <NotificationsDrawer roomId={roomId} />
            </div>
        </div>
    );
}

export default NotificationsBottomSheet;
