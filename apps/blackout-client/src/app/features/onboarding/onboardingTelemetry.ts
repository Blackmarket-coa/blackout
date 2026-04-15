import type { OnboardingStepId } from './onboardingState';

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
      };

export type OnboardingAnalyticsSummary = {
    started: number;
    completed: number;
    droppedOff: number;
    skipped: number;
    completionRate: number;
    avgCompletionMs: number;
    dropOffByStep: Partial<Record<OnboardingStepId, number>>;
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
    elapsedMs: number,
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
    elapsedMs: number,
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
    elapsedMs: number,
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
    skipped: boolean,
) => {
    emit({
        name: 'onboarding_completed',
        spaceId,
        completedAt,
        elapsedMs,
        skipped,
    });
};

export const getOnboardingAnalyticsSummary = (spaceId?: string): OnboardingAnalyticsSummary => {
    const filtered = readStore().events.filter((event) => (spaceId ? event.spaceId === spaceId : true));

    const started = filtered.filter((event) => event.name === 'onboarding_started').length;
    const completedEvents = filtered.filter(
        (event): event is Extract<OnboardingTelemetryEvent, { name: 'onboarding_completed' }> =>
            event.name === 'onboarding_completed',
    );
    const droppedOffEvents = filtered.filter(
        (event): event is Extract<OnboardingTelemetryEvent, { name: 'onboarding_dropped_off' }> =>
            event.name === 'onboarding_dropped_off',
    );

    const completed = completedEvents.length;
    const droppedOff = droppedOffEvents.length;
    const skipped = completedEvents.filter((event) => event.skipped).length;
    const avgCompletionMs =
        completedEvents.length > 0
            ? Math.round(
                  completedEvents.reduce((sum, event) => sum + event.elapsedMs, 0) /
                      completedEvents.length,
              )
            : 0;

    const dropOffByStep = droppedOffEvents.reduce<Partial<Record<OnboardingStepId, number>>>(
        (acc, event) => ({
            ...acc,
            [event.step]: (acc[event.step] ?? 0) + 1,
        }),
        {},
    );

    return {
        started,
        completed,
        droppedOff,
        skipped,
        completionRate: started > 0 ? Number(((completed / started) * 100).toFixed(1)) : 0,
        avgCompletionMs,
        dropOffByStep,
    };
};

export const clearOnboardingAnalytics = () => {
    writeStore({ events: [] });
};
