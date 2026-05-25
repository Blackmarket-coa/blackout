import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWelcomeContent } from '../welcome/useWelcome';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { ONBOARDING_CREATOR_PATH } from '../../pages/paths';
import { downloadDebugBundle } from '../settings/debugBundle';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import {
    listCanopiesByTag,
    listTopics,
    type TopicCanopySummary,
    type TopicSummary,
} from '../topics/topicsClient';
import { writeDiscoveryInterestTags } from '../home/discoveryInterests';
import {
    ONBOARDING_STEP_SEQUENCE,
    type CommunityIntent,
    type OnboardingRole,
    type OnboardingStepId,
    useOnboardingProgress,
} from './onboardingState';
import { useHomeTour } from './homeTourState';
import {
    trackOnboardingCommunitiesSeeded,
    trackOnboardingCompleted,
    trackOnboardingDebugBundleDownloaded,
    trackOnboardingDroppedOff,
    trackOnboardingInterestsSelected,
    trackOnboardingStarted,
    trackOnboardingStepCompleted,
    trackOnboardingStepViewed,
    trackOnboardingTourStarted,
} from './onboardingTelemetry';

const INTEREST_CANOPY_LIMIT = 6;
const INTEREST_TOPIC_LIMIT = 24;

type OnboardingFlowProps = {
    spaceId: string;
    onClose?: () => void;
    onCompleted?: (skipped: boolean) => void;
};

const stepLabel: Record<OnboardingStepId, string> = {
    choose_role: 'Choose your role',
    welcome_context: 'Welcome + context',
    interest_picker: 'Pick your interests',
    find_communities: 'Find communities',
    community_selection: 'Community selection',
    channel_subscription: 'Channel subscription',
    first_contribution: 'First contribution prompt',
    developer_tools: 'For developers & bug hunters',
};

// Files implementing the developer-tools surfaces the beta step links to.
const DEVELOPER_STEP_FILE_PATHS = [
    'apps/blackout-client/src/app/features/settings/developer-tools/DevelopTools.tsx',
    'apps/blackout-client/src/app/features/settings/developer-tools/AccountData.tsx',
    'apps/blackout-client/src/app/features/common-settings/developer-tools/DevelopTools.tsx',
    'apps/blackout-client/src/app/features/common-settings/developer-tools/StateEventEditor.tsx',
    'apps/blackout-client/src/app/features/common-settings/developer-tools/SendRoomEvent.tsx',
    'apps/blackout-client/src/app/features/settings/DeveloperSettings.tsx',
];

const DEVELOPER_STEP_DOC_LINKS: { label: string; href: string }[] = [
    { label: 'README.md', href: '/README.md' },
    { label: 'developer_guide.md', href: '/developer_guide.md' },
    { label: 'TESTERS.md', href: '/TESTERS.md' },
    { label: 'DISCORD_PARITY_BUILD_PLAN.md', href: '/DISCORD_PARITY_BUILD_PLAN.md' },
    {
        label: 'docs/discord_like_onboarding_execution_plan.md',
        href: '/docs/discord_like_onboarding_execution_plan.md',
    },
];

export const OnboardingFlow = ({ spaceId, onClose, onCompleted }: OnboardingFlowProps) => {
    const welcome = useWelcomeContent(spaceId);
    const progress = useOnboardingProgress(spaceId);
    const homeTour = useHomeTour();
    const navigate = useNavigate();
    const matrixClient = useMatrixClientOrNull();
    const creatorPathEnabled = runtimeFeatureFlags.onboardingCreatorPath;
    const developerStepEnabled = runtimeFeatureFlags.onboardingDeveloperStep;
    const interestPickerEnabled = runtimeFeatureFlags.onboardingInterestPicker;
    const homeTourEnabled = runtimeFeatureFlags.onboardingHomeTour;

    // Visible steps respect the step-gating flags without mutating the
    // canonical sequence used for persisted indexes. When a flag is off the
    // corresponding step drops out so existing snapshots keep pointing at a
    // real step.
    const visibleSteps = useMemo<OnboardingStepId[]>(
        () =>
            ONBOARDING_STEP_SEQUENCE.filter((step) => {
                if (step === 'developer_tools') return developerStepEnabled;
                if (step === 'interest_picker' || step === 'find_communities')
                    return interestPickerEnabled;
                return true;
            }),
        [developerStepEnabled, interestPickerEnabled]
    );

    const [startedAt, setStartedAt] = useState(Date.now());
    const [stepIndex, setStepIndex] = useState(0);
    const [role, setRole] = useState<OnboardingRole | undefined>(undefined);
    const [communityIntent, setCommunityIntent] = useState<CommunityIntent | undefined>(undefined);
    const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [seededCanopyIds, setSeededCanopyIds] = useState<string[]>([]);
    const [topicOptions, setTopicOptions] = useState<TopicSummary[]>([]);
    const [canopySuggestions, setCanopySuggestions] = useState<TopicCanopySummary[]>([]);
    const [selectedCanopyIds, setSelectedCanopyIds] = useState<string[]>([]);
    const [canopiesLoading, setCanopiesLoading] = useState(false);
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

    const clampedStepIndex = Math.min(stepIndex, Math.max(0, visibleSteps.length - 1));
    const currentStep = visibleSteps[clampedStepIndex];
    const featuredChannels = welcome.data.featuredChannels.map((channel) => channel.roomId);
    const suggestedChannels =
        featuredChannels.length > 0 ? featuredChannels : ['#announcements', '#general'];

    useEffect(() => {
        let mounted = true;
        void progress.read().then((snapshot) => {
            if (!mounted) return;
            const initialStep = snapshot.completed
                ? Math.max(0, visibleSteps.length - 1)
                : Math.min(snapshot.stepIndex, Math.max(0, visibleSteps.length - 1));
            setStartedAt(snapshot.startedAt);
            setStepIndex(initialStep);
            setRole(snapshot.role);
            setCommunityIntent(snapshot.communityIntent);
            setSelectedChannels(snapshot.selectedChannels);
            setSelectedInterests(snapshot.selectedInterests ?? []);
            setSeededCanopyIds(snapshot.seededCanopyIds ?? []);
            setFirstContributionPrompt(snapshot.firstContributionPrompt ?? '');
            setDone(snapshot.completed);
            // Hand-off state: user previously chose 'creator' but neither the
            // creator wizard nor a "switch back to member" has marked the
            // member flow done. Show a small terminal panel so they can
            // resume the creator wizard or return to role selection.
            setCreatorHandoff(snapshot.role === 'creator' && !snapshot.completed);
            setLoading(false);
            trackOnboardingStarted(spaceId, snapshot.startedAt);
            const stepIdForTelemetry = visibleSteps[initialStep];
            if (stepIdForTelemetry) {
                trackOnboardingStepViewed(
                    spaceId,
                    stepIdForTelemetry,
                    initialStep,
                    Date.now() - snapshot.startedAt
                );
            }
        });

        return () => {
            mounted = false;
        };
    }, [progress, spaceId, restartKey, visibleSteps]);

    const elapsedMs = useMemo(() => Date.now() - startedAt, [startedAt, stepIndex]);

    // Load topic options for the interest picker once the flow opens. Gated on
    // the flag so the request never fires when the steps aren't visible.
    useEffect(() => {
        if (!interestPickerEnabled) return undefined;
        let cancelled = false;
        void listTopics({ limit: INTEREST_TOPIC_LIMIT })
            .then((response) => {
                if (!cancelled) setTopicOptions(response.items);
            })
            .catch(() => {
                if (!cancelled) setTopicOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [interestPickerEnabled, restartKey]);

    // Derive canopy suggestions for the find-communities step from the chosen
    // interests. Every suggestion defaults to checked — the Discord "default
    // channels" pattern — so the Following feed is seeded unless the user
    // opts out.
    useEffect(() => {
        if (!interestPickerEnabled || currentStep !== 'find_communities') return undefined;
        if (selectedInterests.length === 0) {
            setCanopySuggestions([]);
            setSelectedCanopyIds([]);
            return undefined;
        }
        let cancelled = false;
        setCanopiesLoading(true);
        void Promise.allSettled(
            selectedInterests.map((tag) => listCanopiesByTag(tag, { limit: INTEREST_CANOPY_LIMIT }))
        )
            .then((results) => {
                if (cancelled) return;
                const byId = new Map<string, TopicCanopySummary>();
                for (const result of results) {
                    if (result.status !== 'fulfilled') continue;
                    for (const canopy of result.value.items) {
                        if (!byId.has(canopy.id)) byId.set(canopy.id, canopy);
                    }
                }
                const suggestions = [...byId.values()];
                setCanopySuggestions(suggestions);
                setSelectedCanopyIds(suggestions.map((canopy) => canopy.id));
            })
            .finally(() => {
                if (!cancelled) setCanopiesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [interestPickerEnabled, currentStep, selectedInterests]);

    const joinSelectedCanopies = useCallback(async (): Promise<string[]> => {
        if (!matrixClient || selectedCanopyIds.length === 0) return [];
        const results = await Promise.allSettled(
            selectedCanopyIds.map((canopyId) => matrixClient.joinRoom(canopyId))
        );
        return selectedCanopyIds.filter((_, index) => results[index].status === 'fulfilled');
    }, [matrixClient, selectedCanopyIds]);

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
        setSelectedInterests([]);
        setSeededCanopyIds([]);
        setSelectedCanopyIds([]);
        setCanopySuggestions([]);
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
                        Continue the creator wizard to finish payout setup, or switch back to the
                        member flow.
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

        const nextStepIndex = Math.min(stepIndex + 1, visibleSteps.length - 1);
        await progress.savePatch({ stepIndex: nextStepIndex });
        setStepIndex(nextStepIndex);
        trackOnboardingStepViewed(
            spaceId,
            visibleSteps[nextStepIndex],
            nextStepIndex,
            Date.now() - startedAt
        );
    };

    const finishOnboarding = async () => {
        const completedAt = Date.now();
        await progress.markCompleted(false);
        trackOnboardingCompleted(spaceId, completedAt, completedAt - startedAt, false);
        setDone(true);
        if (homeTourEnabled) {
            trackOnboardingTourStarted(completedAt);
            await homeTour.start();
        }
        onCompleted?.(false);
    };

    const continueToNextStep = async () => {
        if (currentStep === 'choose_role' && role) {
            await selectRoleAndAdvance(role);
            return;
        }

        let nextSeededCanopyIds = seededCanopyIds;
        if (currentStep === 'interest_picker') {
            if (matrixClient) {
                await writeDiscoveryInterestTags(matrixClient, selectedInterests);
            }
            trackOnboardingInterestsSelected(spaceId, selectedInterests.length);
        } else if (currentStep === 'find_communities') {
            nextSeededCanopyIds = await joinSelectedCanopies();
            setSeededCanopyIds(nextSeededCanopyIds);
            trackOnboardingCommunitiesSeeded(spaceId, nextSeededCanopyIds.length);
        }

        trackOnboardingStepCompleted(spaceId, currentStep, stepIndex, elapsedMs);
        const isLast = stepIndex === visibleSteps.length - 1;
        const nextStepIndex = Math.min(stepIndex + 1, visibleSteps.length - 1);
        await progress.savePatch({
            stepIndex: nextStepIndex,
            communityIntent,
            selectedChannels,
            selectedInterests,
            seededCanopyIds: nextSeededCanopyIds,
            firstContributionPrompt,
        });

        if (isLast) {
            await finishOnboarding();
            return;
        }

        setStepIndex(nextStepIndex);
        trackOnboardingStepViewed(
            spaceId,
            visibleSteps[nextStepIndex],
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
                    Step {stepIndex + 1} of {visibleSteps.length}
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
                            width: `${((stepIndex + 1) / visibleSteps.length) * 100}%`,
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

            {currentStep === 'interest_picker' ? (
                <div data-testid="onboarding-interest-picker" style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Pick a few topics you care about. We'll use them to fill your feed and
                        suggest communities to join.
                    </p>
                    {topicOptions.length === 0 ? (
                        <p
                            data-testid="onboarding-interest-empty"
                            style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}
                        >
                            Loading topics…
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {topicOptions.map((topic) => {
                                const selected = selectedInterests.includes(topic.tag);
                                return (
                                    <button
                                        key={topic.tag}
                                        type="button"
                                        data-testid="onboarding-interest-chip"
                                        aria-pressed={selected}
                                        onClick={() =>
                                            setSelectedInterests((prev) =>
                                                selected
                                                    ? prev.filter((tag) => tag !== topic.tag)
                                                    : Array.from(new Set([...prev, topic.tag]))
                                            )
                                        }
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 999,
                                            padding: '4px 10px',
                                            background: selected
                                                ? 'var(--accent-muted)'
                                                : 'var(--bg-surface)',
                                        }}
                                    >
                                        #{topic.tag}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : null}

            {currentStep === 'find_communities' ? (
                <div data-testid="onboarding-find-communities" style={{ display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        {selectedInterests.length === 0
                            ? 'Pick a few interests first to see suggested communities.'
                            : "Join a few communities so your feed isn't empty. We've pre-selected some based on your interests."}
                    </p>
                    {canopiesLoading ? (
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
                            Loading communities…
                        </p>
                    ) : null}
                    {!canopiesLoading &&
                    selectedInterests.length > 0 &&
                    canopySuggestions.length === 0 ? (
                        <p
                            data-testid="onboarding-find-communities-empty"
                            style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}
                        >
                            No suggestions yet — you can browse communities later.
                        </p>
                    ) : null}
                    <div style={{ display: 'grid', gap: 6 }}>
                        {canopySuggestions.map((canopy) => {
                            const selected = selectedCanopyIds.includes(canopy.id);
                            return (
                                <label
                                    key={canopy.id}
                                    data-testid="onboarding-community-option"
                                    style={{ display: 'inline-flex', gap: 8, alignItems: 'start' }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={(event) => {
                                            setSelectedCanopyIds((prev) =>
                                                event.target.checked
                                                    ? Array.from(new Set([...prev, canopy.id]))
                                                    : prev.filter((id) => id !== canopy.id)
                                            );
                                        }}
                                    />
                                    <span style={{ display: 'grid', gap: 2 }}>
                                        <strong>{canopy.name}</strong>
                                        {canopy.bio ? (
                                            <small style={{ color: 'var(--text-secondary)' }}>
                                                {canopy.bio}
                                            </small>
                                        ) : null}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
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

            {currentStep === 'developer_tools' ? (
                <div data-testid="onboarding-developer-step" style={{ display: 'grid', gap: 10 }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        We're launching beta. If you're a bug hunter or part of a software team,
                        these references will help you file actionable issues.
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Open <strong>Settings → Developer Tools</strong> to inspect Matrix events,
                        edit room state, view account data, copy your access token, and export a
                        debug bundle.
                    </p>
                    <div style={{ display: 'grid', gap: 4 }}>
                        <small style={{ color: 'var(--text-secondary)' }}>Source files</small>
                        <ul
                            data-testid="onboarding-developer-file-paths"
                            style={{
                                margin: 0,
                                padding: '6px 8px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                listStyle: 'none',
                                display: 'grid',
                                gap: 4,
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {DEVELOPER_STEP_FILE_PATHS.map((path) => (
                                <li key={path}>{path}</li>
                            ))}
                        </ul>
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                        <small style={{ color: 'var(--text-secondary)' }}>Documentation</small>
                        <div
                            data-testid="onboarding-developer-doc-links"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                        >
                            {DEVELOPER_STEP_DOC_LINKS.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        fontSize: 12,
                                        color: 'var(--accent-primary)',
                                        textDecoration: 'underline',
                                    }}
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        data-testid="onboarding-developer-bundle"
                        onClick={() => {
                            downloadDebugBundle({
                                includeLocalStorage: true,
                                includeFeatureFlags: false,
                            });
                            trackOnboardingDebugBundleDownloaded('wizard', 'developer_tools');
                        }}
                        style={{ width: 'fit-content' }}
                    >
                        Download debug bundle
                    </button>
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
                            visibleSteps[previousStep],
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
                        {stepIndex === visibleSteps.length - 1 ? 'Finish' : 'Continue'}
                    </button>
                </div>
            </footer>
        </section>
    );
};

export default OnboardingFlow;
