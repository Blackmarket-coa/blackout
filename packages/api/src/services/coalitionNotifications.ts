/**
 * Coalition-scoped notification inbox. The platform has no general push bus
 * (domain events are an append-only log; only Matrix rooms / per-user webhooks /
 * overlay widgets deliver), so Surge alerts and Milestone Broadcasts reach
 * contributors as rows they poll — plus a best-effort Matrix announcement to the
 * project's coalition room. The inbox is the reliable, testable channel; the
 * Matrix post is fire-and-forget and never blocks the caller.
 */
import { db } from '../db/store';
import type { CoalitionNotificationKind, CoalitionNotificationRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { logEvent } from './marketplaceObservability';
import { newNotificationId } from './coalitionStore';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ContributorNotification {
    kind: CoalitionNotificationKind;
    title: string;
    body?: string;
    surgeId?: string;
    milestoneId?: string;
    feedItemId?: string;
}

/**
 * Notify every distinct person who has contributed to a project within the
 * trailing window (default 30 days). Inserts one inbox row per recipient and
 * fires a best-effort Matrix announcement to the project's coalition room.
 * Returns the number of recipients notified.
 */
export function notifyProjectContributors(
    projectId: string,
    notification: ContributorNotification,
    options: { sinceHours?: number; nowMs?: number } = {}
): number {
    const nowMs = options.nowMs ?? Date.now();
    const sinceMs = options.sinceHours
        ? nowMs - options.sinceHours * 60 * 60 * 1000
        : nowMs - 30 * DAY_MS;
    const sinceIso = new Date(sinceMs).toISOString();

    const recipients = new Set(
        db.listCoalitionProjectSupports({ projectId, sinceIso }).map((s) => s.supporterUserId)
    );

    for (const recipientUserId of recipients) {
        db.addCoalitionNotification({
            id: newNotificationId(),
            recipientUserId,
            kind: notification.kind,
            projectId,
            surgeId: notification.surgeId,
            milestoneId: notification.milestoneId,
            feedItemId: notification.feedItemId,
            title: notification.title,
            body: notification.body,
        });
    }

    announceToCoalitionRoom(projectId, notification);

    return recipients.size;
}

/** Best-effort Matrix post to the project's coalition room. Never throws. */
function announceToCoalitionRoom(projectId: string, notification: ContributorNotification): void {
    const project = db.getCoalitionProject(projectId);
    // Projects are canopy-scoped; the canopy id is the coalition room. Only
    // attempt a post when it looks like a Matrix room id.
    const roomId = project?.canopyId;
    if (!roomId || !roomId.startsWith('!')) return;
    const text = notification.body
        ? `${notification.title} — ${notification.body}`
        : notification.title;
    void matrixClient.sendMessage(roomId, text).catch((err: unknown) =>
        logEvent('coalition.notification.matrix_post_threw', {
            projectId,
            error: String(err),
        })
    );
}

export function listNotifications(
    recipientUserId: string,
    options: { unreadOnly?: boolean; limit?: number } = {}
): CoalitionNotificationRecord[] {
    return db.listCoalitionNotifications({
        recipientUserId,
        unreadOnly: options.unreadOnly,
        limit: options.limit ?? 100,
    });
}

export function markNotificationRead(
    id: string,
    recipientUserId: string
): CoalitionNotificationRecord | null {
    return db.markCoalitionNotificationRead(id, recipientUserId) ?? null;
}
