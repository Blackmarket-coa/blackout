import {
    notificationsAdapterPlugin,
    resolveNotificationsAdapter,
    type HookResult,
    type PushRulesResult,
} from '../plugins/notifications';

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
