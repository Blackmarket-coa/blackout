import { useCallback, useMemo } from 'react';
import {
    INITIAL_USER_QUESTS,
    USER_QUESTS_ACCOUNT_DATA_TYPE,
    isUserQuestsPayload,
    type QuestId,
    type UserQuestsPayload,
} from '@blackout/protocol';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAccountData } from '../../hooks/useAccountData';

/**
 * Read the user's quest sheet from account data.
 *
 * The sheet is per-user (account data, not room state) so it follows the
 * user across devices. Brand-new users see `INITIAL_USER_QUESTS` until
 * the first write lands; the brief explicitly wants the sheet to be
 * dismissable, so we honor the `dismissedAt` field even when active
 * quests remain.
 */
export interface UserQuestsResult {
    payload: UserQuestsPayload;
    /** True when every onboarding quest has been completed. */
    allComplete: boolean;
    /** True iff the user dismissed the sheet manually. */
    dismissed: boolean;
}

export function useUserQuests(): UserQuestsResult {
    const event = useAccountData(USER_QUESTS_ACCOUNT_DATA_TYPE);
    const payload: UserQuestsPayload = useMemo(() => {
        const content = event?.getContent?.<Record<string, unknown>>();
        if (content && isUserQuestsPayload(content)) return content;
        return INITIAL_USER_QUESTS;
    }, [event]);

    const allComplete = payload.activeQuests.length === 0;
    const dismissed = typeof payload.dismissedAt === 'string' && payload.dismissedAt.length > 0;
    return { payload, allComplete, dismissed };
}

/**
 * Mark a single quest complete. Idempotent — calling twice with the same
 * id is a no-op, so the auto-detection scanner can fire freely without
 * spamming account-data writes.
 */
export function useCompleteQuest() {
    const mx = useMatrixClient();
    const { payload } = useUserQuests();

    return useCallback(
        async (id: QuestId, roomId?: string) => {
            if (payload.completedQuests.some((c) => c.id === id)) return;
            const next: UserQuestsPayload = {
                activeQuests: payload.activeQuests.filter((q) => q !== id),
                completedQuests: [
                    ...payload.completedQuests,
                    {
                        id,
                        completedAt: new Date().toISOString(),
                        ...(roomId ? { roomId } : {}),
                    },
                ],
                dismissedAt: payload.dismissedAt,
            };
            // matrix-js-sdk's setAccountData accepts arbitrary type strings;
            // the cast keeps the call signature compatible without forking
            // the union of known account-data types.
            await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> }).setAccountData(
                USER_QUESTS_ACCOUNT_DATA_TYPE,
                next,
            );
        },
        [mx, payload],
    );
}

/**
 * Dismiss the quest sheet without completing the remaining quests. The
 * sheet stays dismissed even if new quests would otherwise auto-complete —
 * the brief calls for the sheet to be dismissable, not nagging.
 */
export function useDismissQuests() {
    const mx = useMatrixClient();
    const { payload } = useUserQuests();

    return useCallback(async () => {
        const next: UserQuestsPayload = {
            ...payload,
            dismissedAt: new Date().toISOString(),
        };
        await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> }).setAccountData(
            USER_QUESTS_ACCOUNT_DATA_TYPE,
            next,
        );
    }, [mx, payload]);
}
