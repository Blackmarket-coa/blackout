import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { useCompostDen } from './useCompost';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * Dialog that confirms composting a den. The brief frames compost as
 * *archive with dignity*: deletion is psychologically violent in
 * cooperatives ("we built this together"); compost reframes ending as
 * renewal. The copy here leans into that — no "delete" / "destroy" /
 * "permanently remove" verbs.
 */
export interface CompostDialogProps {
    roomId: string;
    onClose: () => void;
    onComposted?: () => void;
}

const styles = {
    backdrop: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 80,
    },
    panel: {
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        padding: 16,
        width: 'min(420px, 90vw)',
        display: 'grid',
        gap: 12,
    },
    helper: { fontSize: 12, color: 'var(--text-secondary)' } as const,
    textarea: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: 8,
        minHeight: 70,
    },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 } as const,
    btn: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
    } as const,
    primary: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--accent-primary)',
        color: 'var(--bg-surface)',
        padding: '6px 10px',
    } as const,
};

export function CompostDialog({ roomId, onClose, onComposted }: CompostDialogProps) {
    const initiator = useAtomValue(userIdAtom);
    const compost = useCompostDen(roomId, initiator);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setErr(null);
        try {
            await compost({ reason: reason.trim() || undefined });
            onComposted?.();
            onClose();
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={styles.backdrop} role="dialog" aria-label="Compost this den" onClick={onClose}>
            <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
                <header>
                    <strong>{BLACKOUT_TERMS.compost.verb} this {BLACKOUT_TERMS.den.singular}?</strong>
                </header>
                <p style={styles.helper}>
                    Composting keeps this {BLACKOUT_TERMS.den.singular}&apos;s lineage visible in
                    the parent {BLACKOUT_TERMS.canopy.singular} and removes you from active
                    membership. The work isn&apos;t deleted — it becomes nutrient for what comes
                    next.
                </p>
                <label style={styles.helper}>
                    What did you learn? (optional)
                    <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        style={styles.textarea}
                        disabled={busy}
                        data-testid="compost-reason"
                    />
                </label>
                {err && (
                    <p style={{ color: 'var(--danger, #EF5350)', fontSize: 12 }}>{err}</p>
                )}
                <div style={styles.actions}>
                    <button type="button" style={styles.btn} onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        style={styles.primary}
                        onClick={() => void submit()}
                        disabled={busy}
                        data-testid="compost-submit"
                    >
                        {busy ? 'Composting…' : BLACKOUT_TERMS.compost.verb}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CompostDialog;
