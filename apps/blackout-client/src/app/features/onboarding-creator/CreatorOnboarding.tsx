import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { useOnboardingProgress } from '../onboarding/onboardingState';
import {
    CREATOR_ONBOARDING_STEP_SEQUENCE,
    useCreatorOnboardingProgress,
    type CreatorOnboardingProgress,
    type CreatorOnboardingStepId,
} from './creatorOnboardingState';
import {
    trackCreatorArchetypesSelected,
    trackCreatorOnboardingCompleted,
    trackCreatorOnboardingStarted,
    trackCreatorStepCompleted,
    trackCreatorStepViewed,
} from './creatorOnboardingTelemetry';
import {
    accentButton,
    bodyStyle,
    ghostButton,
    headerStyle,
    layoutStyle,
    stepDescStyle,
    subStyle,
    titleStyle,
    type CreatorStepDraft,
} from './creatorOnboardingStyles';
import { ArchetypeStep } from './steps/ArchetypeStep';
import { PlatformLinkingStep } from './steps/PlatformLinkingStep';
import { HubSetupStep } from './steps/HubSetupStep';
import { DensStep } from './steps/DensStep';
import { CoalitionStep } from './steps/CoalitionStep';
import { RewardEnrollStep } from './steps/RewardEnrollStep';
import { KitInstallStep } from './steps/KitInstallStep';
import { FirstActionStep, firstActionTarget } from './steps/FirstActionStep';

const stepLabel: Record<CreatorOnboardingStepId, string> = {
    identity: 'Identity',
    platform_linking: 'Platform linking',
    hub_setup: 'Creator hub',
    dens: 'Dens',
    coalition: 'Coalition',
    rewards: 'Rewards',
    kit: 'Creator kit',
    first_action: 'First action',
};

const buildDraft = (snapshot: CreatorOnboardingProgress): CreatorStepDraft => ({
    selectedArchetypes: snapshot.selectedArchetypes,
    linkedProviders: snapshot.linkedProviders,
    selectedDenTypes: snapshot.selectedDenTypes,
    coalitionOptIn: snapshot.coalitionOptIn,
    enrolledRewardTier: snapshot.enrolledRewardTier,
    installedKitId: snapshot.installedKitId,
    firstActionId: snapshot.firstActionId,
});

const progressBarStyle: CSSProperties = {
    height: 6,
    borderRadius: 999,
    background: 'var(--border-default, #374151)',
    overflow: 'hidden',
    margin: '8px 0 0',
};

const footerStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '12px 16px 20px',
    borderTop: '1px solid var(--border-default, #374151)',
};

/**
 * Creator headquarters onboarding — an 8-step wizard mounted at
 * `/onboarding/creator` and gated by `onboardingCreatorPath`. Steps reuse
 * existing subsystems (linked accounts, dens, coalition, rewards, kits). State
 * is account-scoped (`co.bmc.onboarding.creator.v1`) and resumes mid-wizard.
 * On finish it marks the member onboarding snapshot complete when a `?from`
 * space id is present, then lands the creator on their chosen first action.
 */
export const CreatorOnboarding = (): JSX.Element => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const fromSpaceId = searchParams.get('from') ?? '';
    const progress = useCreatorOnboardingProgress();
    // Space-scoped member progress, used only to clear the creator handoff
    // panel on completion. Bound to '' when there is no `?from` — its methods
    // are never called in that case.
    const memberProgress = useOnboardingProgress(fromSpaceId);

    const platformLinkingEnabled = runtimeFeatureFlags.onboardingCreatorPlatformLinking;
    const rewardsEnabled = runtimeFeatureFlags.onboardingCreatorRewards;
    const kitsEnabled = runtimeFeatureFlags.onboardingCreatorKits;

    const visibleSteps = useMemo<CreatorOnboardingStepId[]>(
        () =>
            CREATOR_ONBOARDING_STEP_SEQUENCE.filter((step) => {
                if (step === 'platform_linking') return platformLinkingEnabled;
                if (step === 'rewards') return rewardsEnabled;
                if (step === 'kit') return kitsEnabled;
                return true;
            }),
        [platformLinkingEnabled, rewardsEnabled, kitsEnabled]
    );

    const [loading, setLoading] = useState(true);
    const [done, setDone] = useState(false);
    const [startedAt, setStartedAt] = useState(Date.now());
    const [stepIndex, setStepIndex] = useState(0);
    const [draft, setDraft] = useState<CreatorStepDraft>(() =>
        buildDraft({
            creatorStepIndex: 0,
            skipped: false,
            creatorCompleted: false,
            startedAt: Date.now(),
            updatedAt: Date.now(),
            selectedArchetypes: [],
            linkedProviders: [],
            selectedDenTypes: [],
        })
    );
    const [restartKey, setRestartKey] = useState(0);

    useEffect(() => {
        let mounted = true;
        void progress.read().then((snapshot) => {
            if (!mounted) return;
            const maxIndex = Math.max(0, visibleSteps.length - 1);
            const initialStep = snapshot.creatorCompleted
                ? maxIndex
                : Math.min(snapshot.creatorStepIndex, maxIndex);
            setStartedAt(snapshot.startedAt);
            setStepIndex(initialStep);
            setDraft(buildDraft(snapshot));
            setDone(snapshot.creatorCompleted);
            setLoading(false);
            trackCreatorOnboardingStarted(snapshot.startedAt);
            const stepId = visibleSteps[initialStep];
            if (stepId)
                trackCreatorStepViewed(stepId, initialStep, Date.now() - snapshot.startedAt);
        });
        return () => {
            mounted = false;
        };
    }, [progress, visibleSteps, restartKey]);

    const patch = useCallback(
        (partial: Partial<CreatorOnboardingProgress>) => {
            setDraft((prev) => ({ ...prev, ...partial }));
            void progress.savePatch(partial);
        },
        [progress]
    );

    const clampedIndex = Math.min(stepIndex, Math.max(0, visibleSteps.length - 1));
    const currentStep = visibleSteps[clampedIndex];
    const isLastStep = clampedIndex >= visibleSteps.length - 1;
    const elapsedMs = Date.now() - startedAt;

    const canContinue = currentStep !== 'identity' || draft.selectedArchetypes.length > 0;

    const goToStep = useCallback(
        (nextIndex: number) => {
            const clamped = Math.max(0, Math.min(nextIndex, visibleSteps.length - 1));
            setStepIndex(clamped);
            void progress.savePatch({ creatorStepIndex: clamped });
            const stepId = visibleSteps[clamped];
            if (stepId) trackCreatorStepViewed(stepId, clamped, Date.now() - startedAt);
        },
        [progress, startedAt, visibleSteps]
    );

    const finish = useCallback(
        async (skipped: boolean) => {
            const completedAt = Date.now();
            await progress.markCompleted(skipped);
            if (fromSpaceId) {
                await memberProgress.markCompleted(false);
            }
            trackCreatorOnboardingCompleted(completedAt, completedAt - startedAt, skipped);
            setDone(true);
            if (!skipped) navigate(firstActionTarget(draft.firstActionId));
        },
        [draft.firstActionId, fromSpaceId, memberProgress, navigate, progress, startedAt]
    );

    const handleContinue = () => {
        if (!canContinue) return;
        if (currentStep) trackCreatorStepCompleted(currentStep, clampedIndex, elapsedMs);
        if (currentStep === 'identity') {
            trackCreatorArchetypesSelected(draft.selectedArchetypes);
        }
        if (isLastStep) {
            void finish(false);
            return;
        }
        goToStep(clampedIndex + 1);
    };

    const restart = async () => {
        await progress.reset();
        setRestartKey((key) => key + 1);
        setDone(false);
    };

    if (loading) {
        return (
            <section style={layoutStyle} data-shell-region="creator-onboarding">
                <header style={headerStyle}>
                    <h1 style={titleStyle}>Become a creator</h1>
                    <p style={subStyle}>Loading your creator headquarters…</p>
                </header>
            </section>
        );
    }

    if (done) {
        return (
            <section style={layoutStyle} data-shell-region="creator-onboarding">
                <header style={headerStyle}>
                    <h1 style={titleStyle}>Your creator headquarters is set up</h1>
                    <p style={subStyle}>
                        Everything’s ready. Jump into the Creator Hub, or restart the setup to make
                        changes.
                    </p>
                </header>
                <div style={bodyStyle}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            style={accentButton}
                            onClick={() => navigate(firstActionTarget(draft.firstActionId))}
                            data-testid="creator-onboarding-go"
                        >
                            Go to my first action
                        </button>
                        <button
                            type="button"
                            style={ghostButton}
                            onClick={() => void restart()}
                            data-testid="creator-onboarding-restart"
                        >
                            Restart setup
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    const stepProps = { draft, patch };
    const percent = Math.round(((clampedIndex + 1) / visibleSteps.length) * 100);

    return (
        <section style={layoutStyle} data-shell-region="creator-onboarding">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Build your creator headquarters</h1>
                <p style={subStyle}>
                    Step {clampedIndex + 1} of {visibleSteps.length} ·{' '}
                    {currentStep ? stepLabel[currentStep] : ''}
                </p>
                <div style={progressBarStyle} aria-hidden="true">
                    <div
                        data-testid="creator-onboarding-progress-bar"
                        style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: 'var(--accent-primary, #3b82f6)',
                        }}
                    />
                </div>
            </header>

            <div style={bodyStyle}>
                {currentStep === 'identity' ? <ArchetypeStep {...stepProps} /> : null}
                {currentStep === 'platform_linking' ? <PlatformLinkingStep {...stepProps} /> : null}
                {currentStep === 'hub_setup' ? <HubSetupStep {...stepProps} /> : null}
                {currentStep === 'dens' ? <DensStep {...stepProps} /> : null}
                {currentStep === 'coalition' ? <CoalitionStep {...stepProps} /> : null}
                {currentStep === 'rewards' ? <RewardEnrollStep {...stepProps} /> : null}
                {currentStep === 'kit' ? <KitInstallStep {...stepProps} /> : null}
                {currentStep === 'first_action' ? <FirstActionStep {...stepProps} /> : null}
                {currentStep === 'identity' && !canContinue ? (
                    <p style={stepDescStyle}>Pick at least one archetype to continue.</p>
                ) : null}
            </div>

            <div style={footerStyle}>
                <button
                    type="button"
                    style={ghostButton}
                    disabled={clampedIndex === 0}
                    onClick={() => goToStep(clampedIndex - 1)}
                    data-testid="creator-onboarding-back"
                >
                    Back
                </button>
                <span style={{ flex: 1 }} />
                <button
                    type="button"
                    style={ghostButton}
                    onClick={() => void finish(true)}
                    data-testid="creator-onboarding-skip"
                >
                    Skip for now
                </button>
                <button
                    type="button"
                    style={accentButton}
                    disabled={!canContinue}
                    onClick={handleContinue}
                    data-testid="creator-onboarding-continue"
                >
                    {isLastStep ? 'Finish' : 'Continue'}
                </button>
            </div>
        </section>
    );
};

export default CreatorOnboarding;
