import { useAtomValue } from 'jotai';
import { activeBurnerAtom, isBurnerActiveAtom } from './burnerAtoms';
import { useBurnerIdentities } from './useBurnerIdentities';

/**
 * Always-mounted, fixed-position chip that appears only while the app is
 * switched into a burner identity. Renders null on the primary account, so it
 * adds no layout/visual change in the default state.
 */
export function BurnerModeIndicator() {
    const isBurnerActive = useAtomValue(isBurnerActiveAtom);
    const activeBurner = useAtomValue(activeBurnerAtom);
    const { busy, switchBack } = useBurnerIdentities();

    if (!isBurnerActive) return null;

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2147483000,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'var(--accent-primary, #b5651d)',
                color: 'var(--text-on-accent, #fff)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                fontSize: 13,
            }}
        >
            <span>Burner mode{activeBurner?.label ? `: ${activeBurner.label}` : ''}</span>
            <button
                type="button"
                disabled={busy}
                onClick={() => void switchBack()}
                style={{
                    border: '1px solid currentColor',
                    background: 'transparent',
                    color: 'inherit',
                    borderRadius: 999,
                    padding: '2px 10px',
                    cursor: 'pointer',
                }}
            >
                Exit
            </button>
        </div>
    );
}

export default BurnerModeIndicator;
