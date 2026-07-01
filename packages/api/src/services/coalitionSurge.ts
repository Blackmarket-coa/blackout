/**
 * Coalition Surge detection + lifecycle. A Surge is a declared 24–48h support
 * spike on a project: it rises in the feed (Momentum already lifts it) and its
 * contributors are notified. This module owns opening surges when support
 * accelerates and expiring them when the window passes; the periodic driver lives
 * in coalitionSurgeScheduler.ts (mirroring scheduledMessageDispatcher).
 */
import { SURGE_DURATION_HOURS, detectSurge } from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionSurgeRecord } from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { notifyProjectContributors } from './coalitionNotifications';
import { newSurgeId } from './coalitionStore';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getActiveSurge(projectId: string): CoalitionSurgeRecord | null {
    return db.getOpenCoalitionSurge(projectId) ?? null;
}

function supportWindows(projectId: string, nowMs: number): { last24h: number; prev24h: number } {
    const supports = db.listCoalitionProjectSupports({ projectId });
    const last24 = new Date(nowMs - DAY_MS).toISOString();
    const prev24 = new Date(nowMs - 2 * DAY_MS).toISOString();
    return {
        last24h: supports.filter((s) => s.createdAt >= last24).length,
        prev24h: supports.filter((s) => s.createdAt >= prev24 && s.createdAt < last24).length,
    };
}

export interface SurgeSweepResult {
    opened: number;
    expired: number;
}

/**
 * One surge-detection pass: open a Surge for every project whose support is
 * spiking (and has none open), and expire any open Surge past its window.
 * Deterministic over `nowMs`; safe to call repeatedly (the open-per-project
 * unique index + detectSurge's min-support floor keep it idempotent).
 */
export function assessAndUpdateSurges(nowMs: number = Date.now()): SurgeSweepResult {
    let opened = 0;
    let expired = 0;

    // Expire open surges whose window has passed.
    for (const surge of db.listCoalitionSurges({ status: 'open' })) {
        if (surge.expiresAt <= new Date(nowMs).toISOString()) {
            db.upsertCoalitionSurge({ ...surge, status: 'expired' });
            emitDomainEvent({
                module: 'monetization',
                type: 'coalition.project.surge.expired',
                payload: { surgeId: surge.id, projectId: surge.projectId },
            });
            expired += 1;
        }
    }

    // Open a surge for spiking projects that don't already have one open.
    for (const project of db.listCoalitionProjects()) {
        if (db.getOpenCoalitionSurge(project.id)) continue;
        const { last24h, prev24h } = supportWindows(project.id, nowMs);
        const { surging, surgeFactor } = detectSurge({
            supportsLast24h: last24h,
            supportsPrev24h: prev24h,
        });
        if (!surging) continue;

        const startedAt = new Date(nowMs).toISOString();
        const expiresAt = new Date(nowMs + SURGE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
        const notifiedCount = notifyProjectContributors(
            project.id,
            {
                kind: 'surge',
                title: `${project.title} is surging`,
                body: 'Support is spiking right now — momentum is building.',
            },
            { nowMs }
        );
        const surge = db.upsertCoalitionSurge({
            id: newSurgeId(),
            projectId: project.id,
            status: 'open',
            surgeFactor,
            supportsLast24h: last24h,
            supportsPrev24h: prev24h,
            notifiedCount,
            startedAt,
            expiresAt,
        });
        emitDomainEvent({
            module: 'monetization',
            type: 'coalition.project.surge.detected',
            payload: {
                surgeId: surge.id,
                projectId: project.id,
                surgeFactor,
                supportsLast24h: last24h,
                notifiedCount,
            },
        });
        opened += 1;
    }

    return { opened, expired };
}
