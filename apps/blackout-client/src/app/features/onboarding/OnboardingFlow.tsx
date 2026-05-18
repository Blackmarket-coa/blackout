import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWelcomeContent } from '../welcome/useWelcome';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { ONBOARDING_CREATOR_PATH } from '../../pages/paths';
import {
    ONBOARDING_STEP_SEQUENCE,
    type CommunityIntent,
    type OnboardingRole,
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
    choose_role: 'Choose your role',
    welcome_context: 'Welcome + context',
    community_selection: 'Community selection',
    channel_subscription: 'Channel subscription',
    first_contribution: 'First contribution prompt',
};

export const OnboardingFlow = ({ spaceId, onClose, onCompleted }: OnboardingFlowProps) => {
    const welcome = useWelcomeContent(spaceId);
    const progress = useOnboardingProgress(spaceId);
    const navigate = useNavigate();
    const creatorPathEnabled = runtimeFeatureFlags.onboardingCreatorPath;

    const [startedAt, setStartedAt] = useState(Date.now());
    const [stepIndex, setStepIndex] = useState(0);
    const [role, setRole] = useState<OnboardingRole | undefined>(undefined);
    const [communityIntent, setCommunityIntent] = useState<CommunityIntent | undefined>(undefined);
    const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
    const [firstContributionPrompt, setFirstContributionPrompt] = useState('');
    const [loading, setLoading] = useState(true);
    const [done, setDone] = useState(false);
    // Bumping `restartKey` re-runs the load effect so a restart re-fires
    // telemetry and re-reads the (now-empty) snapshot without a page reload.
    const [restartKey, setRestartKey] = useState(0);
    // When the snapshot's role is 'creator' but completion hasn't been
    // marked yet, the user has been handed off to the dedicated creator
    // wizard. Show a handoff panel rather than restarting role-select.
    const [creatorHandoff, setCreatorHandoff] = useState(false);

    const currentStep = ONBOARDING_STEP_SEQUENCE[stepIndex];
    const featuredChannels = welcome.data.featuredChannels.map((channel) => channel.roomId);
    const suggestedChannels =
        featuredChannels.length > 0 ? featuredChannels : ['#announcements', '#general'];

    useEffect(() => {
        let mounted = true;
        void progress.read().then((snapshot) => {
            if (!mounted) return;
            const initialStep = snapshot.completed
                ? ONBOARDING_STEP_SEQUENCE.length - 1
                : snapshot.stepIndex;
            setStartedAt(snapshot.startedAt);
            setStepIndex(initialStep);
            setRole(snapshot.role);
            setCommunityIntent(snapshot.communityIntent);
            setSelectedChannels(snapshot.selectedChannels);
            setFirstContributionPrompt(snapshot.firstContributionPrompt ?? '');
            setDone(snapshot.completed);
            // Hand-off state: user previously chose 'creator' but neither the
            // creator wizard nor a "switch back to member" has marked the
            // member flow done. Show a small terminal panel so they can
            // resume the creator wizard or return to role selection.
            setCreatorHandoff(snapshot.role === 'creator' && !snapshot.completed);
            setLoading(false);
            trackOnboardingStarted(spaceId, snapshot.startedAt);
            trackOnboardingStepViewed(
                spaceId,
                ONBOARDING_STEP_SEQUENCE[initialStep],
                initialStep,
                Date.now() - snapshot.startedAt
            );
        });

        return () => {
            mounted = false;
        };
    }, [progress, spaceId, restartKey]);

    const elapsedMs = useMemo(() => Date.now() - startedAt, [startedAt, stepIndex]);

    if (loading) {
        return <p style={{ color: 'var(--text-secondary)' }}>Loading onboarding progress…</p>;
    }

    // Reset all local state and re-run the load effect via `restartKey`. No
    // page reload — `progress.reset()` writes the fresh snapshot to
    // localStorage synchronously before the effect re-reads, so the next
    // render sees a clean slate.
    const restartFlow = async () => {
        await progress.reset();
        setStepIndex(0);
        setRole(undefined);
        setCommunityIntent(undefined);
        setSelectedChannels([]);
        setFirstContributionPrompt('');
        setDone(false);
        setCreatorHandoff(false);
        setStartedAt(Date.now());
        setLoading(true);
        setRestartKey((key) => key + 1);
    };

    if (done) {
        return (
            <section style={{ display: 'grid', gap: 12 }}>
                <h2 style={{ marginBottom: 0 }}>Onboarding already completed</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    You can continue to your {BLACKOUT_TERMS.canopy.singular} or restart onboarding
                    if needed.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        data-testid="onboarding-restart"
                        onClick={() => void restartFlow()}
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

    if (creatorHandoff) {
        return (
            <section
                data-testid="onboarding-creator-handoff"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'grid',
                    gap: 12,
                }}
            >
                <header style={{ display: 'grid', gap: 6 }}>
                    <strong>You're set up as a creator</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        Continue the creator wizard to finish payout setup, or switch back to
                        the member flow.
                    </span>
                </header>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        data-testid="onboarding-creator-continue"
                        onClick={() => navigate(ONBOARDING_CREATOR_PATH)}
                    >
                        Continue creator setup
                    </button>
                    <button
                        type="button"
                        data-testid="onboarding-switch-to-member"
                        onClick={async () => {
                            await progress.savePatch({ role: undefined, stepIndex: 0 });
                            setRole(undefined);
                            setStepIndex(0);
                            setCreatorHandoff(false);
                        }}
                    >
                        Switch back to member flow
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
        (currentStep !== 'community_selection' || typeof communityIntent !== 'undefined') &&
        (currentStep !== 'choose_role' || typeof role !== 'undefined');

    const selectRoleAndAdvance = async (nextRole: OnboardingRole) => {
        setRole(nextRole);
        trackOnboardingStepCompleted(spaceId, currentStep, stepIndex, elapsedMs);
        await progress.savePatch({ role: nextRole });

        if (nextRole === 'creator') {
            // Hand off to the dedicated creator-onboarding wizard. The
            // member flow stays under this component; the creator path
            // is owned by the `onboarding-creator` feature module
            // (PR 7) and lives at `/onboarding/creator`. The creator
            // wizard is responsible for calling markCompleted when its
            // own steps are done; until then this component renders a
            // handoff panel (role='creator' + completed=false) so the
            // user can resume or switch back.
            setCreatorHandoff(true);
            navigate(ONBOARDING_CREATOR_PATH);
            return;
        }

        const nextStepIndex = Math.min(stepIndex + 1, ONBOARDING_STEP_SEQUENCE.length - 1);
        await progress.savePatch({ stepIndex: nextStepIndex });
        setStepIndex(nextStepIndex);
        trackOnboardingStepViewed(
            spaceId,
            ONBOARDING_STEP_SEQUENCE[nextStepIndex],
            nextStepIndex,
            Date.now() - startedAt
        );
    };

    const continueToNextStep = async () => {
        if (currentStep === 'choose_role' && role) {
            await selectRoleAndAdvance(role);
            return;
        }

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
            Date.now() - startedAt
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
                <div
                    aria-hidden="true"
                    data-testid="onboarding-progress-bar"
                    style={{
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--bg-input)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${
                                ((stepIndex + 1) / ONBOARDING_STEP_SEQUENCE.length) * 100
                            }%`,
                            height: '100%',
                            background: 'var(--accent-primary)',
                            transition: 'width 200ms ease',
                        }}
                    />
                </div>
            </header>

            {currentStep === 'choose_role' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        How would you like to use Blackout?
                    </p>
                    <div
                        data-testid="onboarding-role-options"
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                    >
                        <button
                            type="button"
                            data-testid="onboarding-role-member"
                            onClick={() => void selectRoleAndAdvance('member')}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 12,
                                padding: '12px 16px',
                                background:
                                    role === 'member' ? 'var(--accent-muted)' : 'var(--bg-surface)',
                                textAlign: 'left',
                                display: 'grid',
                                gap: 4,
                            }}
                        >
                            <strong>Member</strong>
                            <small style={{ color: 'var(--text-secondary)' }}>
                                Join existing communities and chat with friends.
                            </small>
                        </button>
                        {creatorPathEnabled ? (
                            <button
                                type="button"
                                data-testid="onboarding-role-creator"
                                onClick={() => void selectRoleAndAdvance('creator')}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 12,
                                    padding: '12px 16px',
                                    background:
                                        role === 'creator'
                                            ? 'var(--accent-muted)'
                                            : 'var(--bg-surface)',
                                    textAlign: 'left',
                                    display: 'grid',
                                    gap: 4,
                                }}
                            >
                                <strong>Creator</strong>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    Sell products, run streams, and earn from your audience.
                                </small>
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {currentStep === 'welcome_context' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                    <h2 style={{ margin: 0 }}>{welcome.data.title}</h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        {welcome.data.description}
                    </p>
                </div>
            ) : null}

            {currentStep === 'community_selection' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        How would you like to get started in this {BLACKOUT_TERMS.canopy.singular}?
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(
                            [
                                {
                                    id: 'join',
                                    label: `Join an existing ${BLACKOUT_TERMS.canopy.singular}`,
                                },
                                {
                                    id: 'create',
                                    label: `Create a new ${BLACKOUT_TERMS.canopy.singular}`,
                                },
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
                                        background: selected
                                            ? 'var(--accent-muted)'
                                            : 'var(--bg-surface)',
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
                                                    : prev.filter((item) => item !== channelId)
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
                            Date.now() - startedAt
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
                    <button
                        type="button"
                        disabled={!canContinue}
                        onClick={() => void continueToNextStep()}
                    >
                        {stepIndex === ONBOARDING_STEP_SEQUENCE.length - 1 ? 'Finish' : 'Continue'}
                    </button>
                </div>
            </footer>
        </section>
    );
};

export default OnboardingFlow;
