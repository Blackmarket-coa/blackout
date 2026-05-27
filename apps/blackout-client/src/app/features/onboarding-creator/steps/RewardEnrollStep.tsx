import { useEffect, useState } from 'react';
import { applyAsAmbassador, fetchMyAmbassador, type AmbassadorTier } from '../../growth';
import { trackCreatorRewardEnrolled } from '../creatorOnboardingTelemetry';
import {
    accentButton,
    cardStyle,
    errorStyle,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

/**
 * Step 6 — Creator Reward Enrollment. Enrolls the creator in the
 * participation-based ambassador/reward program. Guards against double-enroll
 * by checking existing status first.
 */
export const RewardEnrollStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const enrolledTier = draft.enrolledRewardTier;

    useEffect(() => {
        if (enrolledTier) return;
        fetchMyAmbassador()
            .then((response) => {
                if (response.ambassador) {
                    patch({ enrolledRewardTier: response.ambassador.tier });
                }
            })
            .catch(() => undefined);
    }, [enrolledTier, patch]);

    const enroll = async () => {
        if (enrolledTier) return;
        setBusy(true);
        setError(null);
        try {
            const { ambassador } = await applyAsAmbassador({});
            const tier: AmbassadorTier = ambassador.tier;
            trackCreatorRewardEnrolled(tier);
            patch({ enrolledRewardTier: tier });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'enrollment failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <article style={cardStyle} data-testid="creator-step-rewards">
            <span style={stepLabelStyle}>Step 6 · Rewards</span>
            <span style={stepTitleStyle}>Earn for building, not just uploading</span>
            <span style={stepDescStyle}>
                Rewards are based on participation — community building, workshops, events, dens,
                and collaborations all count, including activity from your linked platforms.
            </span>
            {error ? (
                <p style={errorStyle} data-testid="creator-rewards-error">
                    {error}
                </p>
            ) : null}
            {enrolledTier ? (
                <p style={stepDescStyle} data-testid="creator-rewards-enrolled">
                    Enrolled as a <strong>{enrolledTier}</strong> ambassador.
                </p>
            ) : (
                <button
                    type="button"
                    style={accentButton}
                    disabled={busy}
                    onClick={() => void enroll()}
                    data-testid="creator-rewards-enroll"
                >
                    {busy ? 'Enrolling…' : 'Join the creator reward program'}
                </button>
            )}
        </article>
    );
};

export default RewardEnrollStep;
