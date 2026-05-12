import { useMemo, useState } from 'react';
import { PLAYBOOK_CATALOG, PLAYBOOK_IDS, type PlaybookId } from '@blackout/protocol';
import { useParty } from './useParty';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';
import { useDismissOnOutsideOrEscape } from '../../room/useDismissOnOutsideOrEscape';

/**
 * Party formation dialog (J5).
 *
 * One screen — name + playbook + invitees — and it inherits whatever it
 * can from the parent. The brief is explicit: the picker isn&apos;t the path
 * for an existing group branching off, the picker is the path for *new*
 * groups. Parties form from people who already know they want a new den.
 */
export interface PartyFormationDialogProps {
    parentRoomId: string;
    onClose: () => void;
    onFormed?: (roomId: string) => void;
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
        width: 'min(460px, 92vw)',
        display: 'grid',
        gap: 12,
    } as const,
    helper: { fontSize: 12, color: 'var(--text-secondary)' } as const,
    input: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
    } as const,
    select: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
    } as const,
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

export function PartyFormationDialog({
    parentRoomId,
    onClose,
    onFormed,
}: PartyFormationDialogProps) {
    const { available, memberCount, formParty } = useParty(parentRoomId);
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [playbookId, setPlaybookId] = useState<PlaybookId>('confluence');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useDismissOnOutsideOrEscape(!busy, null, onClose);

    const playbookOptions = useMemo(() => [...PLAYBOOK_IDS], []);

    const submit = async () => {
        setBusy(true);
        setErr(null);
        try {
            const roomId = await formParty({
                name: name || undefined,
                domain: domain || undefined,
                playbookId,
            });
            onFormed?.(roomId);
            onClose();
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={styles.backdrop}
            role="dialog"
            aria-label="Form a party"
            onClick={onClose}
            data-testid="party-formation-backdrop"
        >
            <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
                <header>
                    <strong>Form a party</strong>
                    <div style={styles.helper}>
                        Spin a new {BLACKOUT_TERMS.den.singular} off from this one. Every member
                        of the parent is invited; you can rename, pick a different
                        {' '}{BLACKOUT_TERMS.playbook.singular}, or write a domain sentence.
                    </div>
                </header>

                {!available && (
                    <p
                        role="alert"
                        style={{ ...styles.helper, color: 'var(--danger, #EF5350)' }}
                    >
                        Parties form from {BLACKOUT_TERMS.den.plural} of at least three members.
                        This {BLACKOUT_TERMS.den.singular} has {memberCount}.
                    </p>
                )}

                <label style={styles.helper}>
                    Name
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={`Party from this ${BLACKOUT_TERMS.den.singular}`}
                        style={styles.input}
                        disabled={busy || !available}
                        data-testid="party-name"
                    />
                </label>

                <label style={styles.helper}>
                    Playbook
                    <select
                        value={playbookId}
                        onChange={(event) => setPlaybookId(event.target.value as PlaybookId)}
                        style={styles.select}
                        disabled={busy || !available}
                        data-testid="party-playbook"
                    >
                        {playbookOptions.map((id) => (
                            <option key={id} value={id}>
                                {PLAYBOOK_CATALOG[id].name}
                            </option>
                        ))}
                    </select>
                </label>

                <label style={styles.helper}>
                    Domain (optional)
                    <input
                        value={domain}
                        onChange={(event) => setDomain(event.target.value)}
                        placeholder="One sentence — what this party decides."
                        style={styles.input}
                        disabled={busy || !available}
                        data-testid="party-domain"
                    />
                </label>

                {err && (
                    <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12 }}>
                        {err}
                    </p>
                )}

                <div style={styles.actions}>
                    <button type="button" style={styles.btn} onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        style={styles.primary}
                        onClick={() => void submit()}
                        disabled={busy || !available}
                        data-testid="party-submit"
                    >
                        {busy ? 'Forming…' : 'Form party'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PartyFormationDialog;
