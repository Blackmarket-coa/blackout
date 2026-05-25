import { useCallback, useMemo, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';

export type OnboardingStepId =
    | 'choose_role'
    | 'welcome_context'
    | 'interest_picker'
    | 'find_communities'
    | 'community_selection'
    | 'channel_subscription'
    | 'first_contribution'
    | 'developer_tools';

// Canonical step order. The `interest_picker` / `find_communities` steps are
// gated by `onboardingInterestPicker` and the trailing `developer_tools` step
// by `onboardingDeveloperStep` — `OnboardingFlow` derives a `visibleSteps`
// array from this constant rather than mutating it, so a persisted index keeps
// pointing at a real step when a flag flips.
export const ONBOARDING_STEP_SEQUENCE: OnboardingStepId[] = [
    'choose_role',
    'welcome_context',
    'interest_picker',
    'find_communities',
    'community_selection',
    'channel_subscription',
    'first_contribution',
    'developer_tools',
];

export type CommunityIntent = 'join' | 'create' | 'browse';
export type OnboardingRole = 'member' | 'creator';

export interface OnboardingProgress {
    stepIndex: number;
    skipped: boolean;
    completed: boolean;
    startedAt: number;
    updatedAt: number;
    completedAt?: number;
    role?: OnboardingRole;
    communityIntent?: CommunityIntent;
    selectedChannels: string[];
    /** Topic tags chosen in the interest-picker step. */
    selectedInterests: string[];
    /** Canopy ids actually joined in the find-communities step. */
    seededCanopyIds: string[];
    firstContributionPrompt?: string;
}

type PersistedProgressPayload = {
    spaces?: Record<string, OnboardingProgress>;
};

// Bumped to v3 alongside the new `choose_role` step. Pre-launch
// surface, so we accept partial reset rather than carrying a v2 →
// v3 migrator.
const ACCOUNT_DATA_KEY = 'co.bmc.onboarding.progress.v3';
const LOCAL_STORAGE_KEY = 'co.bmc.onboarding.progress.local.v3';

const buildDefaultProgress = (): OnboardingProgress => {
    const now = Date.now();
    return {
        stepIndex: 0,
        skipped: false,
        completed: false,
        startedAt: now,
        updatedAt: now,
        selectedChannels: [],
        selectedInterests: [],
        seededCanopyIds: [],
    };
};

const clampStepIndex = (value: number): number =>
    Math.max(0, Math.min(value, ONBOARDING_STEP_SEQUENCE.length - 1));

const normalizeProgress = (value: unknown): OnboardingProgress => {
    const fallback = buildDefaultProgress();
    if (!value || typeof value !== 'object') return fallback;

    const entry = value as Partial<OnboardingProgress>;
    return {
        stepIndex: clampStepIndex(typeof entry.stepIndex === 'number' ? entry.stepIndex : 0),
        skipped: entry.skipped === true,
        completed: entry.completed === true,
        startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : fallback.startedAt,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : fallback.updatedAt,
        completedAt: typeof entry.completedAt === 'number' ? entry.completedAt : undefined,
        role: entry.role === 'member' || entry.role === 'creator' ? entry.role : undefined,
        communityIntent:
            entry.communityIntent === 'join' ||
            entry.communityIntent === 'create' ||
            entry.communityIntent === 'browse'
                ? entry.communityIntent
                : undefined,
        selectedChannels: Array.isArray(entry.selectedChannels)
            ? entry.selectedChannels.filter(
                  (channel): channel is string => typeof channel === 'string'
              )
            : [],
        selectedInterests: Array.isArray(entry.selectedInterests)
            ? entry.selectedInterests.filter(
                  (interest): interest is string => typeof interest === 'string'
              )
            : [],
        seededCanopyIds: Array.isArray(entry.seededCanopyIds)
            ? entry.seededCanopyIds.filter(
                  (canopyId): canopyId is string => typeof canopyId === 'string'
              )
            : [],
        firstContributionPrompt:
            typeof entry.firstContributionPrompt === 'string'
                ? entry.firstContributionPrompt
                : undefined,
    };
};

const readLocalProgressMap = (): Record<string, OnboardingProgress> => {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as PersistedProgressPayload;
        const spaces = parsed.spaces ?? {};
        return Object.fromEntries(
            Object.entries(spaces).map(([spaceId, value]) => [spaceId, normalizeProgress(value)])
        );
    } catch {
        return {};
    }
};

const writeLocalProgressMap = (spaces: Record<string, OnboardingProgress>) => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ spaces } satisfies PersistedProgressPayload)
    );
};

const mergeProgress = (
    current: OnboardingProgress,
    patch: Partial<OnboardingProgress>
): OnboardingProgress => {
    const now = Date.now();
    const stepIndex =
        typeof patch.stepIndex === 'number' ? clampStepIndex(patch.stepIndex) : current.stepIndex;
    return {
        ...current,
        ...patch,
        stepIndex,
        updatedAt: now,
    };
};

export const useOnboardingProgress = (spaceId: string) => {
    const client = useMatrixClient();
    const accountDataClient = client as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    };

    const [localMap, setLocalMap] = useState<Record<string, OnboardingProgress>>(() =>
        readLocalProgressMap()
    );

    const getLocalProgress = useCallback((): OnboardingProgress => {
        return localMap[spaceId] ?? buildDefaultProgress();
    }, [localMap, spaceId]);

    const writeLocal = useCallback(
        (nextProgress: OnboardingProgress) => {
            setLocalMap((prev) => {
                const nextMap = { ...prev, [spaceId]: nextProgress };
                writeLocalProgressMap(nextMap);
                return nextMap;
            });
        },
        [spaceId]
    );

    const read = useCallback(async (): Promise<OnboardingProgress> => {
        const event = accountDataClient.getAccountData(ACCOUNT_DATA_KEY);
        const remote = event?.getContent() as PersistedProgressPayload | undefined;
        const remoteProgress = remote?.spaces?.[spaceId];
        if (remoteProgress) {
            const normalized = normalizeProgress(remoteProgress);
            writeLocal(normalized);
            return normalized;
        }

        return getLocalProgress();
    }, [accountDataClient, getLocalProgress, spaceId, writeLocal]);

    const persist = useCallback(
        async (nextProgress: OnboardingProgress) => {
            const event = accountDataClient.getAccountData(ACCOUNT_DATA_KEY);
            const existing = (event?.getContent() as PersistedProgressPayload | undefined) ?? {};
            const spaces = {
                ...(existing.spaces ?? {}),
                [spaceId]: nextProgress,
            };

            writeLocal(nextProgress);
            await accountDataClient.setAccountData(ACCOUNT_DATA_KEY, { ...existing, spaces });
        },
        [accountDataClient, spaceId, writeLocal]
    );

    const savePatch = useCallback(
        async (patch: Partial<OnboardingProgress>) => {
            const current = await read();
            const next = mergeProgress(current, patch);
            await persist(next);
            return next;
        },
        [persist, read]
    );

    const markCompleted = useCallback(
        async (skipped = false) => {
            const now = Date.now();
            return savePatch({
                skipped,
                completed: true,
                completedAt: now,
                stepIndex: ONBOARDING_STEP_SEQUENCE.length - 1,
            });
        },
        [savePatch]
    );

    const reset = useCallback(async () => {
        const next = buildDefaultProgress();
        await persist(next);
        return next;
    }, [persist]);

    return useMemo(
        () => ({
            read,
            savePatch,
            markCompleted,
            reset,
        }),
        [markCompleted, read, reset, savePatch]
    );
};
