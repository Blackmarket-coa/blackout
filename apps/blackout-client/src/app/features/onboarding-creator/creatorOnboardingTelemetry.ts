import type { AmbassadorTier } from '../growth';
import type { CreatorOnboardingStepId } from './creatorOnboardingState';

export type CreatorOnboardingTelemetryEvent =
    | { name: 'creator_onboarding_started'; startedAt: number }
    | {
          name: 'creator_onboarding_step_viewed';
          step: CreatorOnboardingStepId;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'creator_onboarding_step_completed';
          step: CreatorOnboardingStepId;
          index: number;
          elapsedMs: number;
      }
    | { name: 'creator_onboarding_completed'; completedAt: number; elapsedMs: number; skipped: boolean }
    | { name: 'creator_archetypes_selected'; count: number; ids: string[] }
    | { name: 'creator_platform_linked'; provider: string }
    | { name: 'creator_reward_enrolled'; tier: AmbassadorTier }
    | { name: 'creator_kit_selected'; kitId: string }
    | { name: 'creator_first_action_chosen'; actionId: string };

const ANALYTICS_KEY = 'co.bmc.onboarding.creator.analytics.v1';
const MAX_EVENTS = 1000;

type Store = { events: CreatorOnboardingTelemetryEvent[] };

const readStore = (): Store => {
    if (typeof window === 'undefined') return { events: [] };
    try {
        const raw = window.localStorage.getItem(ANALYTICS_KEY);
        if (!raw) return { events: [] };
        const parsed = JSON.parse(raw) as Store;
        return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch {
        return { events: [] };
    }
};

const emit = (event: CreatorOnboardingTelemetryEvent) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail: event }));
    }
    const store = readStore();
    store.events.push(event);
    if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(-MAX_EVENTS);
    }
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(store));
    }
};

export const trackCreatorOnboardingStarted = (startedAt: number) =>
    emit({ name: 'creator_onboarding_started', startedAt });

export const trackCreatorStepViewed = (
    step: CreatorOnboardingStepId,
    index: number,
    elapsedMs: number
) => emit({ name: 'creator_onboarding_step_viewed', step, index, elapsedMs });

export const trackCreatorStepCompleted = (
    step: CreatorOnboardingStepId,
    index: number,
    elapsedMs: number
) => emit({ name: 'creator_onboarding_step_completed', step, index, elapsedMs });

export const trackCreatorOnboardingCompleted = (
    completedAt: number,
    elapsedMs: number,
    skipped: boolean
) => emit({ name: 'creator_onboarding_completed', completedAt, elapsedMs, skipped });

export const trackCreatorArchetypesSelected = (ids: string[]) =>
    emit({ name: 'creator_archetypes_selected', count: ids.length, ids });

export const trackCreatorPlatformLinked = (provider: string) =>
    emit({ name: 'creator_platform_linked', provider });

export const trackCreatorRewardEnrolled = (tier: AmbassadorTier) =>
    emit({ name: 'creator_reward_enrolled', tier });

export const trackCreatorKitSelected = (kitId: string) =>
    emit({ name: 'creator_kit_selected', kitId });

export const trackCreatorFirstActionChosen = (actionId: string) =>
    emit({ name: 'creator_first_action_chosen', actionId });
