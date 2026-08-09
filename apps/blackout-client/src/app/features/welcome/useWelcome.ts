import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAccountData } from '../../hooks/useAccountData';
import {
    useLegacyRoomAdapter as useRoom,
    useLegacyRoomMembersAdapter as useRoomMembers,
} from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import {
    CANOPY_ONBOARDING_COMPLETED_KEY,
    MEMBER_ONBOARDING_PROGRESS_KEY,
} from '../onboarding/accountDataKeys';

export interface FeaturedChannel {
    roomId: string;
    emoji: string;
    description: string;
}

export interface WelcomeContent {
    title: string;
    description: string;
    featuredChannels: FeaturedChannel[];
    bannerMxcUrl?: string;
}

export type OnboardingStepType = 'rules' | 'roles' | 'channels';

export interface OnboardingStep {
    type: OnboardingStepType;
    title: string;
    content?: string;
    description?: string;
    requireAccept?: boolean;
    roles?: string[];
    channels?: string[];
}

export interface OnboardingContent {
    enabled: boolean;
    steps: OnboardingStep[];
}

export const WELCOME_EVENT_TYPE = 'co.bmc.welcome';
export const ONBOARDING_EVENT_TYPE = 'co.bmc.onboarding';
export const ONBOARDING_ACCOUNT_DATA_KEY = CANOPY_ONBOARDING_COMPLETED_KEY;

const defaultWelcome = (spaceName: string): WelcomeContent => ({
    title: `Welcome to ${spaceName}!`,
    description: 'Introduce your community here.',
    featuredChannels: [],
});

const defaultOnboarding: OnboardingContent = {
    enabled: false,
    steps: [],
};

/**
 * Fallback onboarding shown to brand-new users accepting an invite when the
 * canopy hasn't configured its own `co.bmc.onboarding` content. Used by
 * `OnboardingPage` (the full-page invite entry) only — NOT by the in-app
 * `ClientLayout` modal, which stays opt-in so existing users in unconfigured
 * canopies aren't interrupted.
 */
export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
    {
        type: 'rules',
        title: 'Welcome to Blackout',
        content:
            "You're in. Blackout is an end-to-end-encrypted, community-run space.\n\n" +
            'No central feed and no ads — just communities (canopies) and the channels ' +
            'inside them (dens). What you join is what you see.',
        requireAccept: false,
    },
    {
        type: 'rules',
        title: 'House rules',
        content:
            'A few ground rules that apply everywhere on Blackout:\n\n' +
            '• Be decent — no harassment, hate, or targeted abuse.\n' +
            '• Respect consent and privacy; don’t share others’ private info.\n' +
            '• No spam, scams, or illegal marketplace activity.\n\n' +
            'Each community sets its own rules on top of these — check the den’s pinned posts.',
        requireAccept: true,
    },
    {
        type: 'rules',
        title: 'Getting around',
        content:
            'Quick orientation:\n\n' +
            '• The left rail lists the dens you can post in.\n' +
            '• Type in the composer at the bottom; messages are end-to-end encrypted.\n' +
            '• Use the top bar for members, pins, search, and notifications.\n\n' +
            'That’s it — finish up and you’ll drop straight into the den.',
        requireAccept: false,
    },
];

const parseFeaturedChannels = (value: unknown): FeaturedChannel[] => {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            if (
                typeof record.roomId !== 'string' ||
                typeof record.emoji !== 'string' ||
                typeof record.description !== 'string'
            )
                return null;
            return { roomId: record.roomId, emoji: record.emoji, description: record.description };
        })
        .filter((item): item is FeaturedChannel => item !== null);
};

const parseOnboardingSteps = (value: unknown): OnboardingStep[] => {
    if (!Array.isArray(value)) return [];

    const steps: OnboardingStep[] = [];
    value.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const record = item as Record<string, unknown>;

        if (record.type !== 'rules' && record.type !== 'roles' && record.type !== 'channels')
            return;
        if (typeof record.title !== 'string') return;

        steps.push({
            type: record.type,
            title: record.title,
            content: typeof record.content === 'string' ? record.content : undefined,
            description: typeof record.description === 'string' ? record.description : undefined,
            requireAccept: record.requireAccept === true,
            roles: Array.isArray(record.roles)
                ? record.roles.filter((role): role is string => typeof role === 'string')
                : undefined,
            channels: Array.isArray(record.channels)
                ? record.channels.filter(
                      (channel): channel is string => typeof channel === 'string'
                  )
                : undefined,
        });
    });
    return steps;
};

export const useWelcomeContent = (spaceId: string) => {
    const roomState = useRoom(spaceId);

    return useMemo(() => {
        const event = roomState.data?.currentState.getStateEvents(WELCOME_EVENT_TYPE, '');
        const content = event?.getContent<Record<string, unknown>>();

        const welcome: WelcomeContent = content
            ? {
                  title:
                      typeof content.title === 'string'
                          ? content.title
                          : defaultWelcome(roomState.data?.name || spaceId).title,
                  description:
                      typeof content.description === 'string'
                          ? content.description
                          : defaultWelcome(roomState.data?.name || spaceId).description,
                  featuredChannels: parseFeaturedChannels(content.featuredChannels),
                  bannerMxcUrl:
                      typeof content.bannerMxcUrl === 'string' ? content.bannerMxcUrl : undefined,
              }
            : defaultWelcome(roomState.data?.name || spaceId);

        return {
            data: welcome,
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [roomState.data, roomState.error, roomState.loading, spaceId]);
};

export const useOnboardingContent = (spaceId: string) => {
    const roomState = useRoom(spaceId);

    return useMemo(() => {
        const event = roomState.data?.currentState.getStateEvents(ONBOARDING_EVENT_TYPE, '');
        const content = event?.getContent<Record<string, unknown>>();

        const onboarding: OnboardingContent = content
            ? {
                  enabled: content.enabled === true,
                  steps: parseOnboardingSteps(content.steps),
              }
            : defaultOnboarding;

        return {
            data: onboarding,
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [roomState.data, roomState.error, roomState.loading]);
};

export const useSetWelcomeContent = (spaceId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (content: WelcomeContent) => {
            await client.sendStateEvent(spaceId, WELCOME_EVENT_TYPE as never, content as never, '');
        },
        [client, spaceId]
    );
};

export const useSetOnboardingContent = (spaceId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (content: OnboardingContent) => {
            await client.sendStateEvent(
                spaceId,
                ONBOARDING_EVENT_TYPE as never,
                content as never,
                ''
            );
        },
        [client, spaceId]
    );
};

/**
 * What the member picked in the wizard's `roles` / `channels` steps.
 *
 * Both are the free-text labels an admin typed into `WelcomeEditor` — not room
 * ids and not Matrix power levels — so there is nothing to resolve them
 * against yet. We record the choice rather than discard it; acting on it (auto
 * -joining a den, granting a role) needs the editor to author real references
 * first.
 */
export interface OnboardingSelections {
    roles: string[];
    channels: string[];
}

type OnboardingCompletionPayload = {
    spaces?: Record<string, boolean>;
    selections?: Record<string, OnboardingSelections>;
};

export const useOnboardingCompletion = (spaceId: string) => {
    const client = useMatrixClient();
    const accountDataClient = client as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    };

    /**
     * True when this space has been onboarded by *either* first-run system.
     *
     * The member flow (`features/onboarding`) is a richer, separate wizard
     * writing its own progress key. Without this check a user who completed it
     * would still be interrupted by the canopy wizard, which auto-opens in
     * `ClientLayout` whenever no den is selected.
     *
     * Not mirrored in the other direction on purpose: the member flow only
     * opens from an explicit button, so there is no interruption to suppress.
     */
    const readCompletion = useCallback(async (): Promise<boolean> => {
        const accountData = accountDataClient
            .getAccountData(ONBOARDING_ACCOUNT_DATA_KEY)
            ?.getContent() as OnboardingCompletionPayload | undefined;
        if (accountData?.spaces?.[spaceId] === true) return true;

        const memberProgress = accountDataClient
            .getAccountData(MEMBER_ONBOARDING_PROGRESS_KEY)
            ?.getContent() as
            | { spaces?: Record<string, { completed?: boolean } | undefined> }
            | undefined;
        return memberProgress?.spaces?.[spaceId]?.completed === true;
    }, [accountDataClient, spaceId]);

    const markCompleted = useCallback(
        async (selections?: OnboardingSelections) => {
            const event = accountDataClient.getAccountData(ONBOARDING_ACCOUNT_DATA_KEY);
            const content = (event?.getContent() as OnboardingCompletionPayload | undefined) ?? {};

            // `selections` is additive — readers that only know about `spaces`
            // (including every already-onboarded user's stored payload) keep
            // working unchanged.
            const hasSelections =
                (selections?.roles.length ?? 0) > 0 || (selections?.channels.length ?? 0) > 0;

            await accountDataClient.setAccountData(ONBOARDING_ACCOUNT_DATA_KEY, {
                ...content,
                spaces: {
                    ...(content.spaces ?? {}),
                    [spaceId]: true,
                },
                ...(hasSelections
                    ? {
                          selections: {
                              ...(content.selections ?? {}),
                              [spaceId]: {
                                  roles: selections?.roles ?? [],
                                  channels: selections?.channels ?? [],
                              },
                          },
                      }
                    : {}),
            });
        },
        [accountDataClient, spaceId]
    );

    return {
        readCompletion,
        markCompleted,
    };
};

export const CANOPY_WELCOME_SEEN_ACCOUNT_DATA_KEY = 'co.bmc.canopy.welcome.seen.v1';

/**
 * Tracks whether the current user has already seen a given canopy's welcome
 * screen, so it shows at most once. Mirrors `useOnboardingCompletion`'s
 * per-space account-data shape (`{ spaces: { [spaceId]: true } }`) but reads
 * reactively via `useAccountData` so the gate hides itself the moment it's
 * marked seen.
 */
export const useCanopyWelcomeSeen = (spaceId: string) => {
    const mx = useMatrixClient();
    const event = useAccountData(CANOPY_WELCOME_SEEN_ACCOUNT_DATA_KEY);

    const seen = useMemo(() => {
        const spaces = (event?.getContent() as { spaces?: Record<string, boolean> } | undefined)
            ?.spaces;
        return spaces?.[spaceId] === true;
    }, [event, spaceId]);

    const markSeen = useCallback(async () => {
        const accountDataClient = mx as unknown as {
            getAccountData: (type: string) => { getContent: () => unknown } | undefined;
            setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
        };
        const content =
            (accountDataClient
                .getAccountData(CANOPY_WELCOME_SEEN_ACCOUNT_DATA_KEY)
                ?.getContent() as { spaces?: Record<string, boolean> } | undefined) ?? {};
        await accountDataClient.setAccountData(CANOPY_WELCOME_SEEN_ACCOUNT_DATA_KEY, {
            ...content,
            spaces: { ...(content.spaces ?? {}), [spaceId]: true },
        });
    }, [mx, spaceId]);

    return { seen, markSeen };
};

export const useSpaceMemberStats = (spaceId: string) => {
    const members = useRoomMembers(spaceId);

    return useMemo(() => {
        const joined = members.data.length;
        const online = members.data.filter(
            (member) =>
                member.events.member?.getContent<Record<string, unknown>>()?.presence === 'online'
        ).length;

        return {
            data: { memberCount: joined, onlineCount: online },
            loading: members.loading,
            error: members.error,
        };
    }, [members.data, members.error, members.loading]);
};
