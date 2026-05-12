import { useMemo } from 'react';
import { phaseFromRoleTerm, type RolePayload } from '@blackout/protocol';
import { PhenologyBar } from '../../components/den-signature';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * Card representing a single sociocratic role. The phenology bar carries
 * term progression: spring → summer → autumn → winter. Vacant roles
 * surface as winter with a "Vacant" badge; an "Open election" CTA wires to
 * a consent-proposal whose description references the `roleId`.
 *
 * Role updates ride on `useSetGovernanceRole`. The "Open election" handler
 * is a thin pass-through so callers can plug in their own modal flow — the
 * card itself stays presentation-only.
 */
export interface RoleCardProps {
    role: RolePayload;
    /** Called when the user taps "Open election". Caller wires the proposal flow. */
    onOpenElection?: (roleId: string) => void;
    /** ISO ms timestamp injected for deterministic tests; defaults to Date.now. */
    nowMs?: number;
}

const styles = {
    card: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
        padding: 12,
        display: 'grid',
        gap: 10,
    } as const,
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    } as const,
    domain: { fontSize: 12, color: 'var(--text-secondary)' } as const,
    bar: { display: 'grid', gap: 4 } as const,
    cta: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
    } as const,
};

const PHASE_LABELS: Record<string, string> = {
    spring: 'In leaf · newly held',
    summer: 'In service',
    autumn: 'Turning · term ends soon',
    winter: 'Vacant or overdue',
    compost: 'Archived',
};

export function RoleCard({ role, onOpenElection, nowMs }: RoleCardProps) {
    const phase = useMemo(() => {
        if (role.phase) return role.phase;
        return phaseFromRoleTerm(role, nowMs);
    }, [role, nowMs]);

    const vacant = !role.holderId || role.holderId.trim().length === 0;

    return (
        <section data-testid={`role-card-${role.roleId}`} style={styles.card}>
            <div style={styles.row}>
                <strong>{role.name}</strong>
                <span style={styles.domain}>{PHASE_LABELS[phase] ?? phase}</span>
            </div>
            {role.domain && <p style={{ margin: 0, ...styles.domain }}>{role.domain}</p>}
            <div style={styles.bar}>
                <span style={styles.domain}>
                    {vacant
                        ? `Vacant — open an election to fill this ${BLACKOUT_TERMS.round.singular}`
                        : `Held by ${role.holderId}`}
                </span>
                <PhenologyBar phase={phase} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {onOpenElection && (
                    <button
                        type="button"
                        data-testid={`role-open-election-${role.roleId}`}
                        onClick={() => onOpenElection(role.roleId)}
                        style={styles.cta}
                    >
                        {vacant || phase === 'autumn' || phase === 'winter'
                            ? 'Open election'
                            : 'Open a re-election'}
                    </button>
                )}
            </div>
        </section>
    );
}

export default RoleCard;
