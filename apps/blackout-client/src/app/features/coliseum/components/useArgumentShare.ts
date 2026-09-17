import { useCallback } from 'react';
import { useShareTarget, type ShareStatus } from '../../../utils/useShareTarget';

const LABEL: Record<ShareStatus, string | null> = {
    idle: null,
    shared: 'Shared',
    copied: 'Link copied',
    failed: 'Share unsupported',
};

/**
 * Share a Coliseum debate/argument. Builds the topic URL and hands it to
 * `useShareTarget`, the one share implementation; this file used to be a
 * second hand-rolled copy of it.
 */
export function useArgumentShare(): {
    shareStatus: string | null;
    onShare: (topicId: string, title: string) => Promise<void>;
} {
    const { status, share } = useShareTarget();
    const onShare = useCallback(
        async (topicId: string, title: string) => {
            await share({
                url: `${window.location.origin}/coliseum?tab=debate&topic=${encodeURIComponent(
                    topicId
                )}`,
                title,
            });
        },
        [share]
    );
    return { shareStatus: LABEL[status], onShare };
}

export default useArgumentShare;
