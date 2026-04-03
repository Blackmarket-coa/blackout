import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom, useRoomMembers } from '../../hooks/useRoom';

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
const ONBOARDING_ACCOUNT_DATA_KEY = 'co.bmc.onboarding.completed';

const defaultWelcome = (spaceName: string): WelcomeContent => ({
  title: `Welcome to ${spaceName}!`,
  description: 'Introduce your community here.',
  featuredChannels: [],
});

const defaultOnboarding: OnboardingContent = {
  enabled: false,
  steps: [],
};

const parseFeaturedChannels = (value: unknown): FeaturedChannel[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      if (typeof record.roomId !== 'string' || typeof record.emoji !== 'string' || typeof record.description !== 'string') return null;
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

    if (record.type !== 'rules' && record.type !== 'roles' && record.type !== 'channels') return;
    if (typeof record.title !== 'string') return;

    steps.push({
      type: record.type,
      title: record.title,
      content: typeof record.content === 'string' ? record.content : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      requireAccept: record.requireAccept === true,
      roles: Array.isArray(record.roles) ? record.roles.filter((role): role is string => typeof role === 'string') : undefined,
      channels: Array.isArray(record.channels) ? record.channels.filter((channel): channel is string => typeof channel === 'string') : undefined,
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
          title: typeof content.title === 'string' ? content.title : defaultWelcome(roomState.data?.name || spaceId).title,
          description: typeof content.description === 'string' ? content.description : defaultWelcome(roomState.data?.name || spaceId).description,
          featuredChannels: parseFeaturedChannels(content.featuredChannels),
          bannerMxcUrl: typeof content.bannerMxcUrl === 'string' ? content.bannerMxcUrl : undefined,
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
    [client, spaceId],
  );
};

export const useSetOnboardingContent = (spaceId: string) => {
  const client = useMatrixClient();

  return useCallback(
    async (content: OnboardingContent) => {
      await client.sendStateEvent(spaceId, ONBOARDING_EVENT_TYPE as never, content as never, '');
    },
    [client, spaceId],
  );
};

export const useOnboardingCompletion = (spaceId: string) => {
  const client = useMatrixClient();
  const accountDataClient = client as unknown as {
    getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
  };

  const readCompletion = useCallback(async (): Promise<boolean> => {
    const accountData = accountDataClient.getAccountData(ONBOARDING_ACCOUNT_DATA_KEY)?.getContent() as
      | { spaces?: Record<string, boolean> }
      | undefined;
    return accountData?.spaces?.[spaceId] === true;
  }, [accountDataClient, spaceId]);

  const markCompleted = useCallback(async () => {
    const event = accountDataClient.getAccountData(ONBOARDING_ACCOUNT_DATA_KEY);
    const content = (event?.getContent() as { spaces?: Record<string, boolean> } | undefined) ?? {};

    await accountDataClient.setAccountData(ONBOARDING_ACCOUNT_DATA_KEY, {
      ...content,
      spaces: {
        ...(content.spaces ?? {}),
        [spaceId]: true,
      },
    });
  }, [accountDataClient, spaceId]);

  return {
    readCompletion,
    markCompleted,
  };
};

export const useSpaceMemberStats = (spaceId: string) => {
  const members = useRoomMembers(spaceId);

  return useMemo(() => {
    const joined = members.data.length;
    const online = members.data.filter((member) => member.events.member?.getContent<Record<string, unknown>>()?.presence === 'online').length;

    return {
      data: { memberCount: joined, onlineCount: online },
      loading: members.loading,
      error: members.error,
    };
  }, [members.data, members.error, members.loading]);
};
