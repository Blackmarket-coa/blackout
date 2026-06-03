import { useEffect, useState } from 'react';
import type { Bounty, BountyApplication, BountyStatus } from '@blackout/core';
import {
    acceptBountyApplication,
    applyToBounty,
    fetchBountyApplications,
    updateBountyStatus,
} from '../bounty/bountyClient';
import { BOUNTY_CATEGORY_LABELS } from './bountyCategoryLabels';
import * as css from './BountyBoard.css';

type Mode = 'loading' | 'poster' | 'applicant';
type ApplyState = 'idle' | 'applying' | 'applied' | 'error';

/**
 * Home-feed bounty detail overlay. Determines the viewer's relationship to the
 * bounty without any client-side identity plumbing: it simply tries to fetch the
 * applicants (a poster-only endpoint). Success → the viewer is the poster, so we
 * show the applicant list with Accept actions; a 401/403 failure → the viewer is
 * a candidate, so we show the Apply action. Accepting an applicant claims the
 * bounty for them and declines the rest (reflected locally).
 */
export const BountyDetailPanel = ({
    bounty,
    onClose,
}: {
    bounty: Bounty;
    onClose: () => void;
}): JSX.Element => {
    const [mode, setMode] = useState<Mode>('loading');
    const [applications, setApplications] = useState<BountyApplication[]>([]);
    const [applyState, setApplyState] = useState<ApplyState>('idle');
    const [status, setStatus] = useState<BountyStatus>(bounty.status);
    const [completeState, setCompleteState] = useState<'idle' | 'completing' | 'done' | 'error'>(
        'idle',
    );

    useEffect(() => {
        let cancelled = false;
        fetchBountyApplications(bounty.id)
            .then((res) => {
                if (cancelled) return;
                setApplications(res.applications);
                setMode('poster');
            })
            .catch(() => {
                if (!cancelled) setMode('applicant');
            });
        return () => {
            cancelled = true;
        };
    }, [bounty.id]);

    const onApply = () => {
        setApplyState('applying');
        applyToBounty(bounty.id)
            .then(() => setApplyState('applied'))
            .catch(() => setApplyState('error'));
    };

    const onAccept = (applicantId: string) => {
        acceptBountyApplication(bounty.id, applicantId)
            .then((res) => {
                setStatus(res.bounty.status);
                setApplications((prev) =>
                    prev.map((a) =>
                        a.applicantId === applicantId
                            ? res.application
                            : a.status === 'pending'
                            ? { ...a, status: 'declined' }
                            : a,
                    ),
                );
            })
            .catch(() => {
                /* swallow — leave the row actionable to retry */
            });
    };

    const onMarkCompleted = () => {
        setCompleteState('completing');
        updateBountyStatus(bounty.id, 'completed')
            .then((res) => {
                setStatus(res.bounty.status);
                setCompleteState('done');
            })
            .catch(() => setCompleteState('error'));
    };

    const canComplete = status === 'claimed' || status === 'in_review';

    return (
        <div className={css.overlay} role="dialog" aria-modal="true" data-testid="bounty-detail-overlay">
            <div className={css.backdrop} onClick={onClose} data-testid="bounty-detail-backdrop" />
            <div className={css.panel} data-testid="bounty-detail-panel">
                <button
                    type="button"
                    className={css.closeButton}
                    onClick={onClose}
                    aria-label="Close"
                    data-testid="bounty-detail-close"
                >
                    ×
                </button>
                <span className={css.categoryTag}>{BOUNTY_CATEGORY_LABELS[bounty.category]}</span>
                <h2 className={css.detailTitle}>{bounty.title}</h2>
                <span className={css.reward}>{bounty.rewardSummary}</span>
                <p className={css.detailDescription}>{bounty.description}</p>

                {bounty.requirements.length > 0 ? (
                    <div className={css.detailList} data-testid="bounty-detail-requirements">
                        <header className={css.label}>Requirements</header>
                        <ul className={css.detailUl}>
                            {bounty.requirements.map((r, i) => (
                                <li key={i}>{r}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {bounty.deliverables.length > 0 ? (
                    <div className={css.detailList} data-testid="bounty-detail-deliverables">
                        <header className={css.label}>Deliverables</header>
                        <ul className={css.detailUl}>
                            {bounty.deliverables.map((d, i) => (
                                <li key={i}>{d}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {mode === 'loading' ? (
                    <p className={css.detailDescription} data-testid="bounty-detail-loading">
                        Loading…
                    </p>
                ) : mode === 'poster' ? (
                    <div data-testid="bounty-detail-applicants">
                        {status === 'completed' || completeState === 'done' ? (
                            <span className={css.applicantStatus} data-testid="bounty-detail-completed">
                                Completed ✓ — reward recorded
                            </span>
                        ) : canComplete ? (
                            <button
                                type="button"
                                className={css.applyButton}
                                data-testid="bounty-mark-completed"
                                disabled={completeState === 'completing'}
                                onClick={onMarkCompleted}
                            >
                                {completeState === 'completing'
                                    ? 'Completing…'
                                    : completeState === 'error'
                                    ? 'Retry complete'
                                    : 'Mark completed'}
                            </button>
                        ) : null}
                        <header className={css.label}>Applicants ({applications.length})</header>
                        {applications.length === 0 ? (
                            <p className={css.detailDescription}>No applicants yet.</p>
                        ) : (
                            applications.map((a) => (
                                <div
                                    key={a.id}
                                    className={css.applicantRow}
                                    data-testid="bounty-applicant-row"
                                >
                                    <span className={css.applicantId}>{a.applicantId}</span>
                                    {a.message ? (
                                        <span className={css.applicantMessage}>{a.message}</span>
                                    ) : null}
                                    <span className={css.applicantStatus}>{a.status}</span>
                                    {a.status === 'pending' ? (
                                        <button
                                            type="button"
                                            className={css.applyButton}
                                            data-testid="bounty-accept"
                                            data-applicant={a.applicantId}
                                            onClick={() => onAccept(a.applicantId)}
                                        >
                                            Accept
                                        </button>
                                    ) : null}
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        className={css.applyButton}
                        data-testid="bounty-detail-apply"
                        disabled={applyState === 'applying' || applyState === 'applied'}
                        onClick={onApply}
                    >
                        {applyState === 'applied'
                            ? 'Applied ✓'
                            : applyState === 'applying'
                            ? 'Applying…'
                            : applyState === 'error'
                            ? 'Retry'
                            : 'Apply'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default BountyDetailPanel;
