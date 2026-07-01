import React, { useCallback, useMemo, useState } from 'react';
import { useCoalitionProject } from '../hooks/useCoalitionFeed';
import { postCoalitionFeedItem } from '../coalitionClient';

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
    const { data, loading, error, support, refetch } = useCoalitionProject(projectId);
    const [amountDollars, setAmountDollars] = useState('10');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [milestoneUrl, setMilestoneUrl] = useState('');
    const [postingMilestone, setPostingMilestone] = useState(false);
    const [milestoneError, setMilestoneError] = useState<string | null>(null);

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

    const latestReachedMilestone = useMemo(() => {
        const reached = (data?.project.milestones ?? []).filter((m) => m.reachedAt);
        return reached.length > 0 ? reached[reached.length - 1] : null;
    }, [data?.project.milestones]);

    const onPostMilestone = useCallback(async () => {
        if (!latestReachedMilestone) return;
        const url = milestoneUrl.trim();
        setPostingMilestone(true);
        setMilestoneError(null);
        try {
            await postCoalitionFeedItem({
                kind: 'video',
                title: `Milestone update: ${latestReachedMilestone.label}`,
                projectId,
                milestoneId: latestReachedMilestone.id,
                mediaUrl: url || undefined,
            });
            setMilestoneUrl('');
            refetch();
        } catch (err) {
            setMilestoneError(err instanceof Error ? err.message : 'Could not post update');
        } finally {
            setPostingMilestone(false);
        }
    }, [latestReachedMilestone, milestoneUrl, projectId, refetch]);

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

    const { project, endowedProgress, recentSupporters, activeSurge } = data;
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
            {activeSurge ? (
                <div
                    data-testid={`coalition-project-surge-${projectId}`}
                    style={{
                        display: 'inline-block',
                        marginBottom: 8,
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#06241a',
                        background: 'linear-gradient(90deg, #f1c40f, #ff8c42)',
                    }}
                >
                    🔥 Surging now
                </div>
            ) : null}
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

            {latestReachedMilestone ? (
                <div
                    data-testid={`coalition-project-milestone-${projectId}`}
                    style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid rgba(255,255,255,0.12)',
                    }}
                >
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                        🎉 Milestone reached: {latestReachedMilestone.label}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                        Builder? Share a milestone video — it surfaces to everyone who supported.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                        <input
                            type="url"
                            placeholder="Video URL (optional)"
                            value={milestoneUrl}
                            onChange={(e) => setMilestoneUrl(e.target.value)}
                            aria-label="Milestone video URL"
                            data-testid={`coalition-project-milestone-url-${projectId}`}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.25)',
                                background: 'rgba(0,0,0,0.3)',
                                color: '#fff',
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void onPostMilestone()}
                            disabled={postingMilestone}
                            data-testid={`coalition-project-milestone-post-${projectId}`}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 999,
                                border: '1px solid rgba(26,188,156,0.6)',
                                fontWeight: 700,
                                cursor: postingMilestone ? 'default' : 'pointer',
                                background: 'transparent',
                                color: '#1ABC9C',
                                opacity: postingMilestone ? 0.6 : 1,
                            }}
                        >
                            {postingMilestone ? 'Posting…' : 'Post update'}
                        </button>
                    </div>
                    {milestoneError ? (
                        <div style={{ fontSize: 12, marginTop: 6, color: '#ffb4a2' }}>
                            {milestoneError}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export default ProjectSupportCard;
