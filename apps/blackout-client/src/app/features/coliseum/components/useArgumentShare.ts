import { useCallback, useState } from 'react';

/**
 * Share a Coliseum debate/argument: Web Share API when available, clipboard
 * fallback, with a transient status string for a toast. (Same contract as the
 * coalition reel's useVideoShare.)
 */
export function useArgumentShare(): {
    shareStatus: string | null;
    onShare: (topicId: string, title: string) => Promise<void>;
} {
    const [shareStatus, setShareStatus] = useState<string | null>(null);
    const onShare = useCallback(async (topicId: string, title: string) => {
        const url = `${window.location.origin}/coliseum?tab=debate&topic=${encodeURIComponent(
            topicId
        )}`;
        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                setShareStatus('Shared');
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                setShareStatus('Link copied');
            } else {
                setShareStatus('Share unsupported');
            }
        } catch {
            setShareStatus('Share cancelled');
        }
        window.setTimeout(() => setShareStatus(null), 1500);
    }, []);
    return { shareStatus, onShare };
}

export default useArgumentShare;
