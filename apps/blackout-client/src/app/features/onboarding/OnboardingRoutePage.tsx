import { useNavigate, useParams } from 'react-router';
import { getSpaceLobbyPath } from '../../pages/pathUtils';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { OnboardingFlow } from './OnboardingFlow';

export const OnboardingRoutePage = () => {
    const navigate = useNavigate();
    const { spaceIdOrAlias } = useParams();

    if (!spaceIdOrAlias) {
        return <p>Missing space id.</p>;
    }

    const finishedDestination = runtimeFeatureFlags.onboardingHomeTour
        ? '/'
        : getSpaceLobbyPath(spaceIdOrAlias);

    return (
        <div style={{ maxWidth: 760, margin: '24px auto', display: 'grid', gap: 12 }}>
            <h1 style={{ marginBottom: 0 }}>Community onboarding</h1>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Complete these steps to personalize your experience.
            </p>
            <OnboardingFlow
                spaceId={spaceIdOrAlias}
                onClose={() => navigate(getSpaceLobbyPath(spaceIdOrAlias))}
                onCompleted={() => navigate(finishedDestination)}
            />
        </div>
    );
};

export default OnboardingRoutePage;
