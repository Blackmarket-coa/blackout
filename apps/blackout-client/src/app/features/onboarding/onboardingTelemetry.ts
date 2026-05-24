import type { OnboardingStepId } from './onboardingState';

export type DebugBundleSource = 'wizard' | 'tour';

export type OnboardingTelemetryEvent =
    | {
          name: 'onboarding_started';
          spaceId: string;
          startedAt: number;
      }
    | {
          name: 'onboarding_step_viewed';
          spaceId: string;
          step: OnboardingStepId;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'onboarding_step_completed';
          spaceId: string;
          step: OnboardingStepId;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'onboarding_dropped_off';
          spaceId: string;
          step: OnboardingStepId;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'onboarding_completed';
          spaceId: string;
          completedAt: number;
          elapsedMs: number;
          skipped: boolean;
      }
    | {
          name: 'onboarding_tour_started';
          startedAt: number;
      }
    | {
          name: 'onboarding_tour_step_viewed';
          stepId: string;
          index: number;
      }
    | {
          name: 'onboarding_tour_step_completed';
          stepId: string;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'onboarding_tour_skipped';
          stepId: string;
          index: number;
          elapsedMs: number;
      }
    | {
          name: 'onboarding_tour_completed';
          elapsedMs: number;
      }
    | {
          name: 'onboarding_debug_bundle_downloaded';
          source: DebugBundleSource;
          stepId: string;
      };

export type OnboardingAnalyticsSummary = {
    started: number;
    completed: number;
    droppedOff: number;
    skipped: number;
    completionRate: number;
    avgCompletionMs: number;
    dropOffByStep: Partial<Record<OnboardingStepId, number>>;
    tour: {
        started: number;
        completed: number;
        skipped: number;
        debugBundleDownloads: number;
        dropOffByStep: Record<string, number>;
    };
};

const ANALYTICS_KEY = 'co.bmc.onboarding.analytics.v1';

type OnboardingAnalyticsStore = {
    events: OnboardingTelemetryEvent[];
};

const readStore = (): OnboardingAnalyticsStore => {
    if (typeof window === 'undefined') {
        return { events: [] };
    }

    try {
        const raw = window.localStorage.getItem(ANALYTICS_KEY);
        if (!raw) return { events: [] };
        const parsed = JSON.parse(raw) as OnboardingAnalyticsStore;
        return {
            events: Array.isArray(parsed.events) ? parsed.events : [],
        };
    } catch {
        return { events: [] };
    }
};

const writeStore = (store: OnboardingAnalyticsStore) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(store));
};

const emit = (event: OnboardingTelemetryEvent) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail: event }));
    }

    const store = readStore();
    store.events.push(event);

    if (store.events.length > 1000) {
        store.events = store.events.slice(-1000);
    }

    writeStore(store);
};

export const trackOnboardingStarted = (spaceId: string, startedAt: number) => {
    emit({
        name: 'onboarding_started',
        spaceId,
        startedAt,
    });
};

export const trackOnboardingStepViewed = (
    spaceId: string,
    step: OnboardingStepId,
    index: number,
    elapsedMs: number
) => {
    emit({
        name: 'onboarding_step_viewed',
        spaceId,
        step,
        index,
        elapsedMs,
    });
};

export const trackOnboardingStepCompleted = (
    spaceId: string,
    step: OnboardingStepId,
    index: number,
    elapsedMs: number
) => {
    emit({
        name: 'onboarding_step_completed',
        spaceId,
        step,
        index,
        elapsedMs,
    });
};

export const trackOnboardingDroppedOff = (
    spaceId: string,
    step: OnboardingStepId,
    index: number,
    elapsedMs: number
) => {
    emit({
        name: 'onboarding_dropped_off',
        spaceId,
        step,
        index,
        elapsedMs,
    });
};

export const trackOnboardingCompleted = (
    spaceId: string,
    completedAt: number,
    elapsedMs: number,
    skipped: boolean
) => {
    emit({
        name: 'onboarding_completed',
        spaceId,
        completedAt,
        elapsedMs,
        skipped,
    });
};

export const trackOnboardingTourStarted = (startedAt: number) => {
    emit({ name: 'onboarding_tour_started', startedAt });
};

export const trackOnboardingTourStepViewed = (stepId: string, index: number) => {
    emit({ name: 'onboarding_tour_step_viewed', stepId, index });
};

export const trackOnboardingTourStepCompleted = (
    stepId: string,
    index: number,
    elapsedMs: number
) => {
    emit({ name: 'onboarding_tour_step_completed', stepId, index, elapsedMs });
};

export const trackOnboardingTourSkipped = (stepId: string, index: number, elapsedMs: number) => {
    emit({ name: 'onboarding_tour_skipped', stepId, index, elapsedMs });
};

export const trackOnboardingTourCompleted = (elapsedMs: number) => {
    emit({ name: 'onboarding_tour_completed', elapsedMs });
};

export const trackOnboardingDebugBundleDownloaded = (
    source: DebugBundleSource,
    stepId: string
) => {
    emit({ name: 'onboarding_debug_bundle_downloaded', source, stepId });
};

export const getOnboardingAnalyticsSummary = (spaceId?: string): OnboardingAnalyticsSummary => {
    const allEvents = readStore().events;

    // Tour and debug-bundle events are global (not space-scoped), so they
    // bypass the spaceId filter applied to the wizard events.
    const filtered = allEvents.filter((event) => {
        if (
            event.name === 'onboarding_tour_started' ||
            event.name === 'onboarding_tour_step_viewed' ||
            event.name === 'onboarding_tour_step_completed' ||
            event.name === 'onboarding_tour_skipped' ||
            event.name === 'onboarding_tour_completed' ||
            event.name === 'onboarding_debug_bundle_downloaded'
        ) {
            return true;
        }
        return spaceId ? event.spaceId === spaceId : true;
    });

    const started = filtered.filter((event) => event.name === 'onboarding_started').length;
    const completedEvents = filtered.filter(
        (event): event is Extract<OnboardingTelemetryEvent, { name: 'onboarding_completed' }> =>
            event.name === 'onboarding_completed'
    );
    const droppedOffEvents = filtered.filter(
        (event): event is Extract<OnboardingTelemetryEvent, { name: 'onboarding_dropped_off' }> =>
            event.name === 'onboarding_dropped_off'
    );

    const completed = completedEvents.length;
    const droppedOff = droppedOffEvents.length;
    const skipped = completedEvents.filter((event) => event.skipped).length;
    const avgCompletionMs =
        completedEvents.length > 0
            ? Math.round(
                  completedEvents.reduce((sum, event) => sum + event.elapsedMs, 0) /
                      completedEvents.length
              )
            : 0;

    const dropOffByStep = droppedOffEvents.reduce<Partial<Record<OnboardingStepId, number>>>(
        (acc, event) => ({
            ...acc,
            [event.step]: (acc[event.step] ?? 0) + 1,
        }),
        {}
    );

    const tourStarted = filtered.filter(
        (event) => event.name === 'onboarding_tour_started'
    ).length;
    const tourCompleted = filtered.filter(
        (event) => event.name === 'onboarding_tour_completed'
    ).length;
    const tourSkippedEvents = filtered.filter(
        (event): event is Extract<OnboardingTelemetryEvent, { name: 'onboarding_tour_skipped' }> =>
            event.name === 'onboarding_tour_skipped'
    );
    const debugBundleDownloads = filtered.filter(
        (event) => event.name === 'onboarding_debug_bundle_downloaded'
    ).length;

    const tourDropOffByStep = tourSkippedEvents.reduce<Record<string, number>>((acc, event) => {
        acc[event.stepId] = (acc[event.stepId] ?? 0) + 1;
        return acc;
    }, {});

    return {
        started,
        completed,
        droppedOff,
        skipped,
        completionRate: started > 0 ? Number(((completed / started) * 100).toFixed(1)) : 0,
        avgCompletionMs,
        dropOffByStep,
        tour: {
            started: tourStarted,
            completed: tourCompleted,
            skipped: tourSkippedEvents.length,
            debugBundleDownloads,
            dropOffByStep: tourDropOffByStep,
        },
    };
};

export const clearOnboardingAnalytics = () => {
    writeStore({ events: [] });
};
