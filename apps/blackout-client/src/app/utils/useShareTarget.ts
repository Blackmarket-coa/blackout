import { useCallback, useState } from 'react';
import { copyToClipboard } from './dom';

/**
 * The one share handler: native share sheet first, clipboard second, and a
 * transient status string either way.
 *
 * This existed as three near-identical copies (VideoReel, useArgumentShare,
 * HomeComposer) that had each drifted — only one handled a dismissed share
 * sheet, none had a clipboard fallback for browsers without
 * `navigator.clipboard`. Sharing is the platform's growth surface; it should
 * not behave differently depending on which screen you are on.
 */
export type ShareStatus = 'idle' | 'shared' | 'copied' | 'failed';

export interface ShareRequest {
    url: string;
    title?: string;
    text?: string;
}

const RESET_MS = 1500;

export function useShareTarget(): {
    status: ShareStatus;
    share: (request: ShareRequest) => Promise<void>;
} {
    const [status, setStatus] = useState<ShareStatus>('idle');

    const share = useCallback(async (request: ShareRequest) => {
        const settle = (next: ShareStatus) => {
            setStatus(next);
            window.setTimeout(() => setStatus('idle'), RESET_MS);
        };
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    ...(request.title ? { title: request.title } : {}),
                    ...(request.text ? { text: request.text } : {}),
                    url: request.url,
                });
                settle('shared');
                return;
            } catch {
                // The person dismissed the sheet, or the browser refused the
                // payload. Either way the clipboard is still a useful answer,
                // so fall through rather than reporting failure.
            }
        }
        const payload = request.text ?? request.url;
        // Await the real clipboard write so a rejection (permissions, a
        // non-secure origin) is reported rather than surfacing as an unhandled
        // promise; `copyToClipboard` is the execCommand path for browsers with
        // no clipboard API at all, and it cannot fail observably.
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(payload);
                settle('copied');
            } catch {
                settle('failed');
            }
            return;
        }
        copyToClipboard(payload);
        settle('copied');
    }, []);

    return { status, share };
}
