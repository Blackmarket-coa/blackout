import { useCallback, useMemo, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import type { AmbassadorTier } from '../growth';
import { isCreatorArchetypeId } from './creatorArchetypes';

export type CreatorOnboardingStepId =
    | 'identity'
    | 'platform_linking'
    | 'hub_setup'
    | 'dens'
    | 'coalition'
    | 'rewards'
    | 'kit'
    | 'first_action';

// Canonical step order. `platform_linking`, `rewards` and `kit` are gated by
// their own flags — `CreatorOnboarding` derives a `visibleSteps` array from
// this constant rather than mutating it, so a persisted index keeps pointing
// at a real step when a flag flips.
export const CREATOR_ONBOARDING_STEP_SEQUENCE: CreatorOnboardingStepId[] = [
    'identity',
    'platform_linking',
    'hub_setup',
    'dens',
    'coalition',
    'rewards',
    'kit',
    'first_action',
];

const AMBASSADOR_TIERS: readonly AmbassadorTier[] = ['seedling', 'sapling', 'canopy', 'elder'];

export interface CreatorOnboardingProgress {
    creatorStepIndex: number;
    skipped: boolean;
    creatorCompleted: boolean;
    startedAt: number;
    updatedAt: number;
    completedAt?: number;
    /** Archetype ids chosen in the identity step. */
    selectedArchetypes: string[];
    /** Linked-account providers connected during onboarding. */
    linkedProviders: string[];
    /** Den types the creator expressed interest in (intent, not creation). */
    selectedDenTypes: string[];
    coalitionOptIn?: boolean;
    enrolledRewardTier?: AmbassadorTier;
    installedKitId?: string;
    firstActionId?: string;
}

type PersistedCreatorProgress = {
    progress?: CreatorOnboardingProgress;
};

// Account-scoped (unlike the space-scoped member `OnboardingProgress`): a
// creator headquarters is a per-user concept, not tied to a single canopy.
const ACCOUNT_DATA_KEY = 'co.bmc.onboarding.creator.v1';
const LOCAL_STORAGE_KEY = 'co.bmc.onboarding.creator.local.v1';

const buildDefaultProgress = (): CreatorOnboardingProgress => {
    const now = Date.now();
    return {
        creatorStepIndex: 0,
        skipped: false,
        creatorCompleted: false,
        startedAt: now,
        updatedAt: now,
        selectedArchetypes: [],
        linkedProviders: [],
        selectedDenTypes: [],
    };
};

const clampStepIndex = (value: number): number =>
    Math.max(0, Math.min(value, CREATOR_ONBOARDING_STEP_SEQUENCE.length - 1));

const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const normalizeProgress = (value: unknown): CreatorOnboardingProgress => {
    const fallback = buildDefaultProgress();
    if (!value || typeof value !== 'object') return fallback;

    const entry = value as Partial<CreatorOnboardingProgress>;
    return {
        creatorStepIndex: clampStepIndex(
            typeof entry.creatorStepIndex === 'number' ? entry.creatorStepIndex : 0
        ),
        skipped: entry.skipped === true,
        creatorCompleted: entry.creatorCompleted === true,
        startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : fallback.startedAt,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : fallback.updatedAt,
        completedAt: typeof entry.completedAt === 'number' ? entry.completedAt : undefined,
        selectedArchetypes: stringArray(entry.selectedArchetypes).filter(isCreatorArchetypeId),
        linkedProviders: stringArray(entry.linkedProviders),
        selectedDenTypes: stringArray(entry.selectedDenTypes),
        coalitionOptIn: typeof entry.coalitionOptIn === 'boolean' ? entry.coalitionOptIn : undefined,
        enrolledRewardTier:
            typeof entry.enrolledRewardTier === 'string' &&
            (AMBASSADOR_TIERS as readonly string[]).includes(entry.enrolledRewardTier)
                ? entry.enrolledRewardTier
                : undefined,
        installedKitId:
            typeof entry.installedKitId === 'string' ? entry.installedKitId : undefined,
        firstActionId: typeof entry.firstActionId === 'string' ? entry.firstActionId : undefined,
    };
};

const readLocalProgress = (): CreatorOnboardingProgress | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedCreatorProgress;
        return parsed.progress ? normalizeProgress(parsed.progress) : null;
    } catch {
        return null;
    }
};

const writeLocalProgress = (progress: CreatorOnboardingProgress) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ progress } satisfies PersistedCreatorProgress)
    );
};

const mergeProgress = (
    current: CreatorOnboardingProgress,
    patch: Partial<CreatorOnboardingProgress>
): CreatorOnboardingProgress => {
    const creatorStepIndex =
        typeof patch.creatorStepIndex === 'number'
            ? clampStepIndex(patch.creatorStepIndex)
            : current.creatorStepIndex;
    return {
        ...current,
        ...patch,
        creatorStepIndex,
        updatedAt: Date.now(),
    };
};

export const useCreatorOnboardingProgress = () => {
    const client = useMatrixClient();
    const accountDataClient = client as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    };

    const [local, setLocal] = useState<CreatorOnboardingProgress>(
        () => readLocalProgress() ?? buildDefaultProgress()
    );

    const writeLocal = useCallback((next: CreatorOnboardingProgress) => {
        setLocal(next);
        writeLocalProgress(next);
    }, []);

    const read = useCallback(async (): Promise<CreatorOnboardingProgress> => {
        const event = accountDataClient.getAccountData(ACCOUNT_DATA_KEY);
        const remote = event?.getContent() as PersistedCreatorProgress | undefined;
        if (remote?.progress) {
            const normalized = normalizeProgress(remote.progress);
            writeLocal(normalized);
            return normalized;
        }
        return local;
    }, [accountDataClient, local, writeLocal]);

    const persist = useCallback(
        async (next: CreatorOnboardingProgress) => {
            writeLocal(next);
            await accountDataClient.setAccountData(ACCOUNT_DATA_KEY, { progress: next });
        },
        [accountDataClient, writeLocal]
    );

    const savePatch = useCallback(
        async (patch: Partial<CreatorOnboardingProgress>) => {
            const current = await read();
            const next = mergeProgress(current, patch);
            await persist(next);
            return next;
        },
        [persist, read]
    );

    const markCompleted = useCallback(
        async (skipped = false) =>
            savePatch({
                skipped,
                creatorCompleted: true,
                completedAt: Date.now(),
                creatorStepIndex: CREATOR_ONBOARDING_STEP_SEQUENCE.length - 1,
            }),
        [savePatch]
    );

    const reset = useCallback(async () => {
        const next = buildDefaultProgress();
        await persist(next);
        return next;
    }, [persist]);

    return useMemo(
        () => ({ read, savePatch, markCompleted, reset }),
        [markCompleted, read, reset, savePatch]
    );
};

export const __test = { normalizeProgress, buildDefaultProgress, clampStepIndex, mergeProgress };
