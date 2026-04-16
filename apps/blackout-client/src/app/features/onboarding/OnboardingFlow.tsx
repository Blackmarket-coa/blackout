import { useEffect, useMemo, useState } from 'react';
import { useWelcomeContent } from '../welcome/useWelcome';
import {
    ONBOARDING_STEP_SEQUENCE,
    type CommunityIntent,
    type OnboardingStepId,
    useOnboardingProgress,
} from './onboardingState';
import {
    trackOnboardingCompleted,
    trackOnboardingDroppedOff,
    trackOnboardingStarted,
    trackOnboardingStepCompleted,
    trackOnboardingStepViewed,
} from './onboardingTelemetry';

type OnboardingFlowProps = {
    spaceId: string;
    onClose?: () => void;
    onCompleted?: (skipped: boolean) => void;
};

const stepLabel: Record<OnboardingStepId, string> = {
    welcome_context: 'Welcome + context',
    community_selection: 'Community selection',
    channel_subscription: 'Channel subscription',
    first_contribution: 'First contribution prompt',
};

export const OnboardingFlow = ({ spaceId, onClose, onCompleted }: OnboardingFlowProps) => {
    const welcome = useWelcomeContent(spaceId);
    const progress = useOnboardingProgress(spaceId);

    const [startedAt, setStartedAt] = useState(Date.now());
    const [stepIndex, setStepIndex] = useState(0);
    const [communityIntent, setCommunityIntent] = useState<CommunityIntent | undefined>(undefined);
    const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
    const [firstContributionPrompt, setFirstContributionPrompt] = useState('');
    const [loading, setLoading] = useState(true);
    const [done, setDone] = useState(false);

    const currentStep = ONBOARDING_STEP_SEQUENCE[stepIndex];
    const featuredChannels = welcome.data.featuredChannels.map((channel) => channel.roomId);
    const suggestedChannels = featuredChannels.length > 0 ? featuredChannels : ['#announcements', '#general'];

    useEffect(() => {
        let mounted = true;
        void progress.read().then((snapshot) => {
            if (!mounted) return;
            const initialStep = snapshot.completed ? ONBOARDING_STEP_SEQUENCE.length - 1 : snapshot.stepIndex;
            setStartedAt(snapshot.startedAt);
            setStepIndex(initialStep);
            setCommunityIntent(snapshot.communityIntent);
            setSelectedChannels(snapshot.selectedChannels);
            setFirstContributionPrompt(snapshot.firstContributionPrompt ?? '');
            setDone(snapshot.completed);
            setLoading(false);
            trackOnboardingStarted(spaceId, snapshot.startedAt);
            trackOnboardingStepViewed(
                spaceId,
                ONBOARDING_STEP_SEQUENCE[initialStep],
                initialStep,
                Date.now() - snapshot.startedAt,
            );
        });

        return () => {
            mounted = false;
        };
    }, [progress, spaceId]);

    const elapsedMs = useMemo(() => Date.now() - startedAt, [startedAt, stepIndex]);

    if (loading) {
        return <p style={{ color: 'var(--text-secondary)' }}>Loading onboarding progress…</p>;
    }

    if (done) {
        return (
            <section style={{ display: 'grid', gap: 12 }}>
                <h2 style={{ marginBottom: 0 }}>Onboarding already completed</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    You can continue to your community or restart onboarding if needed.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => void progress.reset().then(() => window.location.reload())}
                    >
                        Restart onboarding
                    </button>
                    {onClose ? (
                        <button type="button" onClick={onClose}>
                            Close
                        </button>
                    ) : null}
                </div>
            </section>
        );
    }

    const canContinue =
        currentStep !== 'community_selection' ||
        typeof communityIntent !== 'undefined';

    const continueToNextStep = async () => {
        trackOnboardingStepCompleted(spaceId, currentStep, stepIndex, elapsedMs);
        const nextStepIndex = Math.min(stepIndex + 1, ONBOARDING_STEP_SEQUENCE.length - 1);
        await progress.savePatch({
            stepIndex: nextStepIndex,
            communityIntent,
            selectedChannels,
            firstContributionPrompt,
        });

        if (stepIndex === ONBOARDING_STEP_SEQUENCE.length - 1) {
            const completedAt = Date.now();
            await progress.markCompleted(false);
            trackOnboardingCompleted(spaceId, completedAt, completedAt - startedAt, false);
            setDone(true);
            onCompleted?.(false);
            return;
        }

        setStepIndex(nextStepIndex);
        trackOnboardingStepViewed(
            spaceId,
            ONBOARDING_STEP_SEQUENCE[nextStepIndex],
            nextStepIndex,
            Date.now() - startedAt,
        );
    };

    const skipFlow = async () => {
        await progress.markCompleted(true);
        trackOnboardingDroppedOff(spaceId, currentStep, stepIndex, elapsedMs);
        trackOnboardingCompleted(spaceId, Date.now(), Date.now() - startedAt, true);
        setDone(true);
        onCompleted?.(true);
    };

    return (
        <section
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                padding: 16,
                display: 'grid',
                gap: 12,
            }}
        >
            <header style={{ display: 'grid', gap: 6 }}>
                <strong>{stepLabel[currentStep]}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    Step {stepIndex + 1} of {ONBOARDING_STEP_SEQUENCE.length}
                </span>
            </header>

            {currentStep === 'welcome_context' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                    <h2 style={{ margin: 0 }}>{welcome.data.title}</h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{welcome.data.description}</p>
                </div>
            ) : null}

            {currentStep === 'community_selection' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        How would you like to get started in this community?
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(
                            [
                                { id: 'join', label: 'Join an existing community' },
                                { id: 'create', label: 'Create a new community' },
                                { id: 'browse', label: 'Browse first' },
                            ] as const
                        ).map((option) => {
                            const selected = communityIntent === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setCommunityIntent(option.id)}
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 999,
                                        padding: '4px 10px',
                                        background: selected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                                    }}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {currentStep === 'channel_subscription' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Pick channels you want to subscribe to.
                    </p>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {suggestedChannels.map((channelId) => {
                            const selected = selectedChannels.includes(channelId);
                            return (
                                <label key={channelId} style={{ display: 'inline-flex', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={(event) => {
                                            setSelectedChannels((prev) =>
                                                event.target.checked
                                                    ? Array.from(new Set([...prev, channelId]))
                                                    : prev.filter((item) => item !== channelId),
                                            );
                                        }}
                                    />
                                    <span>{channelId}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {currentStep === 'first_contribution' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Share your first contribution idea so we can personalize your feed.
                    </p>
                    <textarea
                        rows={4}
                        value={firstContributionPrompt}
                        onChange={(event) => setFirstContributionPrompt(event.target.value)}
                        placeholder="Example: I can help answer FAQs and post release updates."
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            padding: 8,
                        }}
                    />
                </div>
            ) : null}

            <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                    type="button"
                    onClick={() => {
                        const previousStep = Math.max(0, stepIndex - 1);
                        setStepIndex(previousStep);
                        trackOnboardingStepViewed(
                            spaceId,
                            ONBOARDING_STEP_SEQUENCE[previousStep],
                            previousStep,
                            Date.now() - startedAt,
                        );
                    }}
                    disabled={stepIndex === 0}
                >
                    Back
                </button>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                    <button type="button" onClick={() => void skipFlow()}>
                        Skip for now
                    </button>
                    <button type="button" disabled={!canContinue} onClick={() => void continueToNextStep()}>
                        {stepIndex === ONBOARDING_STEP_SEQUENCE.length - 1 ? 'Finish' : 'Continue'}
                    </button>
                </div>
            </footer>
        </section>
    );
};

export default OnboardingFlow;
