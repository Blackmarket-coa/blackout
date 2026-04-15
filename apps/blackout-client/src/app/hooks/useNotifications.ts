import { useAtomValue, useSetAtom } from 'jotai';
import {
  notificationsAdapterPlugin,
  resolveNotificationsAdapter,
  type HookResult,
  type PushRulesResult,
} from '../plugins/notifications';
import {
  digestPreferencesAtom,
  notificationPreferencesAccountDataAtom,
  spaceNotificationPresetAtom,
  temporaryMuteAtom,
  upsertTemporaryMuteAtom,
  validateNotificationSemanticMapping,
  type SpaceNotificationPreset,
  type TemporaryMuteDurationPreset,
} from '../state/notifications';

const adapter = () => resolveNotificationsAdapter(notificationsAdapterPlugin.isEnabled());

/** Returns unread totals/highlights/mentions for a room. */
export const useNotificationCount = (
  roomId: string
): HookResult<{ total: number; highlight: number; mentions: number }> => {
  return adapter().useNotificationCount(roomId);
};

/** Returns and sets room notification behavior (mute/mention/all). */
export const useNotificationType = (roomId: string) => {
  return adapter().useNotificationType(roomId);
};

/** Returns push rules and helpers to update room mute state. */
export const usePushRules = (): PushRulesResult => adapter().usePushRules();

/** Per-space preset stored in account-data compatible shape (all/mentions/none). */
export const useSpaceNotificationPreset = (spaceId: string) => {
  const preset = useAtomValue(spaceNotificationPresetAtom(spaceId));
  const setPreset = useSetAtom(spaceNotificationPresetAtom(spaceId));

  return {
    preset,
    setPreset,
  };
};

/** Client-side temporary mute scheduler. */
export const useTemporaryMute = (targetId: string) => {
  const mute = useAtomValue(temporaryMuteAtom(targetId));
  const upsertMute = useSetAtom(upsertTemporaryMuteAtom);
  const clear = useSetAtom(temporaryMuteAtom(targetId));

  const setMute = (
    durationPreset: TemporaryMuteDurationPreset,
    options?: {
      scope?: 'room' | 'space';
      customDurationMs?: number;
    }
  ) =>
    upsertMute({
      targetId,
      durationPreset,
      scope: options?.scope,
      customDurationMs: options?.customDurationMs,
    });

  return {
    mute,
    setMute,
    clearMute: () => clear(undefined),
  };
};

/** Optional digest grouping controls for low-priority alerts. */
export const useLowPriorityDigestSettings = () => {
  const settings = useAtomValue(digestPreferencesAtom);
  const setSettings = useSetAtom(digestPreferencesAtom);

  return {
    settings,
    setSettings,
  };
};

/** Account-data payload suitable for Matrix setAccountData. */
export const useNotificationPreferencesAccountData = () =>
  useAtomValue(notificationPreferencesAccountDataAtom);

/** Guard rail to ensure receipt/unread semantics are preserved. */
export const useValidateNotificationSemanticMapping = () => {
  return (payload: {
    accountData: unknown;
    receiptsTouched: boolean;
    unreadCounterMutated: boolean;
  }) => validateNotificationSemanticMapping(payload);
};

export type { SpaceNotificationPreset, TemporaryMuteDurationPreset };
