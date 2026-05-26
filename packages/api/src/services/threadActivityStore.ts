import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';

const activitiesBySubject = new Map<string, ThreadActivityUpdatedPayload[]>();

export interface ListThreadActivityOptions {
    limit?: number;
    sinceIso?: string;
}

export function listThreadActivity(
    subject: string,
    options: ListThreadActivityOptions = {},
): ThreadActivityUpdatedPayload[] {
    let result = (activitiesBySubject.get(subject) ?? []).filter(
        (entry) => entry.unreadCount > 0,
    );

    if (options.sinceIso) {
        const sinceMs = new Date(options.sinceIso).getTime();
        if (!Number.isNaN(sinceMs)) {
            result = result.filter(
                (entry) => new Date(entry.occurredAt).getTime() > sinceMs,
            );
        }
    }

    result = [...result].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    if (typeof options.limit === 'number' && options.limit > 0) {
        result = result.slice(0, options.limit);
    }
    return result;
}

export function markThreadActivityRead(
    subject: string,
    activityId: string,
): ThreadActivityUpdatedPayload {
    const occurredAt = new Date().toISOString();
    const existing = (activitiesBySubject.get(subject) ?? []).find(
        (entry) => entry.activityId === activityId,
    );
    if (existing) {
        existing.unreadCount = 0;
        existing.occurredAt = occurredAt;
        return { ...existing };
    }
    // Idempotent: an unknown id (already pruned, or never tracked) still
    // resolves to a zero-unread payload so the client can clear it locally.
    return {
        activityId,
        threadRootEventId: '',
        roomId: '',
        kind: 'thread_replied',
        unreadCount: 0,
        occurredAt,
    };
}

/** Test/seed helper: replace a subject's activity list. */
export function __setThreadActivityForTests(
    subject: string,
    activities: ThreadActivityUpdatedPayload[],
): void {
    activitiesBySubject.set(subject, activities);
}

/** Test-only helper used to reset state between integration tests. */
export function __resetThreadActivityStoreForTests(): void {
    activitiesBySubject.clear();
}
