import { useMemo } from 'react';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';

/**
 * "Pulse" — ambient daily-digest counter. Counts how many timeline events
 * landed in the room in the last 24h. The brief frames Pulse as
 * digest-only (email at v1, not push), so this hook is the *display*
 * primitive — the server-side digest job is out of scope for the client.
 *
 * Why so cheap: pulse is a low-stakes ambient signal, not an alert. A
 * single integer per room is enough to fuel a sparkline or a "X new
 * since yesterday" caption.
 */
export interface PulseForRoom {
    roomId: string;
    /** Count of non-redacted timeline events in the trailing 24h. */
    count: number;
}

const DAY_MS = 86_400_000;

export function usePulse(roomId: string | null | undefined, nowMs?: number): PulseForRoom {
    const timeline = useRoomTimeline(roomId ?? '');
    return useMemo(() => {
        if (!roomId) return { roomId: '', count: 0 };
        const cutoff = (nowMs ?? Date.now()) - DAY_MS;
        let count = 0;
        for (const event of timeline.data) {
            if (event.isRedacted()) continue;
            if (event.getTs() >= cutoff) count += 1;
        }
        return { roomId, count };
    }, [roomId, timeline.data, nowMs]);
}
