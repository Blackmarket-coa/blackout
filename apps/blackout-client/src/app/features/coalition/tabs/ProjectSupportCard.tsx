import React, { useCallback, useMemo, useState } from 'react';
import { useCoalitionProject } from '../hooks/useCoalitionFeed';

export interface ProjectSupportCardProps {
    projectId: string;
    /** ISO 4217-ish currency to denominate the contribution in. Defaults to USD. */
    currency?: string;
}

function dollars(cents: number): string {
    return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * The support layer rendered over a project-backed reel item: a live progress
 * bar with goal-gradient emphasis as it nears completion, the endowed-progress
 * framing ("you're already part of X%"), a supporter wall (social proof), and a
 * one-tap Support control. Built around the research's single best-evidenced
 * engagement engine — visible momentum toward a shared goal.
 */
export function ProjectSupportCard({ projectId, currency = 'USD' }: ProjectSupportCardProps) {
    const { data, loading, error, support } = useCoalitionProject(projectId);
    const [amountDollars, setAmountDollars] = useState('10');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const onSupport = useCallback(async () => {
        const value = Math.round(Number(amountDollars) * 100);
        if (!Number.isFinite(value) || value < 100) {
            setSubmitError('Enter at least $1');
            return;
        }
        setSubmitting(true);
        setSubmitError(null);
        try {
            await support({ grossCents: value, currency });
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Support failed');
        } finally {
            setSubmitting(false);
        }
    }, [amountDollars, currency, support]);

    const pct = useMemo(() => Math.round((data?.progress ?? 0) * 100), [data?.progress]);
    // Goal-gradient: the bar glows brighter and warmer as the goal nears, so the
    // decisive final stretch feels decisive.
    const nearComplete = pct >= 80;

    if (loading && !data) {
        return <div style={{ fontSize: 13, opacity: 0.8 }}>Loading project…</div>;
    }
    if (error || !data) {
        return null;
    }

    const { project, endowedProgress, recentSupporters } = data;
    const hasGoal = (project.fundingGoalCents ?? 0) > 0;

    return (
        <div
            data-testid={`coalition-project-support-${projectId}`}
            style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(13, 31, 20, 0.55)',
                border: '1px solid rgba(26, 188, 156, 0.35)',
            }}
        >
            {hasGoal ? (
                <>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 6,
                        }}
                    >
                        <span data-testid={`coalition-project-progress-${projectId}`}>
                            {dollars(project.raisedCents)} of{' '}
                            {dollars(project.fundingGoalCents ?? 0)} · {pct}%
                        </span>
                        <span style={{ opacity: 0.85 }}>
                            {project.supporterCount} supporter
                            {project.supporterCount === 1 ? '' : 's'}
                        </span>
                    </div>
                    <div
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{
                            height: 8,
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.15)',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                width: `${pct}%`,
                                height: '100%',
                                borderRadius: 999,
                                background: nearComplete
                                    ? 'linear-gradient(90deg, #1ABC9C, #f1c40f)'
                                    : 'linear-gradient(90deg, #2ecc71, #1ABC9C)',
                                transition: 'width 240ms ease',
                            }}
                        />
                    </div>
                    {endowedProgress ? (
                        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
                            You&rsquo;re already part of{' '}
                            {Math.round(endowedProgress.percentAlreadyEnabled * 100)}% of this.{' '}
                            {endowedProgress.headStartReason}
                        </div>
                    ) : null}
                </>
            ) : (
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                    Support {project.title} — every bit fuels the work.
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <span style={{ opacity: 0.8 }}>$</span>
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    aria-label="Support amount in dollars"
                    data-testid={`coalition-project-amount-${projectId}`}
                    style={{
                        width: 72,
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.25)',
                        background: 'rgba(0,0,0,0.3)',
                        color: '#fff',
                    }}
                />
                <button
                    type="button"
                    onClick={() => void onSupport()}
                    disabled={submitting}
                    data-testid={`coalition-project-support-button-${projectId}`}
                    style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: 'none',
                        fontWeight: 700,
                        cursor: submitting ? 'default' : 'pointer',
                        background: '#1ABC9C',
                        color: '#06241a',
                        opacity: submitting ? 0.6 : 1,
                    }}
                >
                    {submitting ? 'Supporting…' : 'Support'}
                </button>
            </div>
            {submitError ? (
                <div style={{ fontSize: 12, marginTop: 6, color: '#ffb4a2' }}>{submitError}</div>
            ) : null}

            {recentSupporters.length > 0 ? (
                <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
                    <span style={{ opacity: 0.7 }}>Recent: </span>
                    {recentSupporters.slice(0, 5).map((s, i) => (
                        <span key={`${s.supporterUserId}-${s.createdAt}`}>
                            {i > 0 ? ', ' : ''}
                            {s.supporterUserId} ({dollars(s.amountCents)})
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default ProjectSupportCard;
