/**
 * Coalition project support — the bridge between the tips engine and a project's
 * funding progress. A captured tip with `contextKind: 'coalition_project'` lands
 * here (see tips.ts `captureTip`), where it becomes a support-ledger row, bumps
 * the project's raised total + supporter count, and stamps any milestone it
 * crosses. The same module computes the read-side project view used by the API:
 * progress, Momentum, endowed-progress framing, and the supporter wall.
 */
import {
    computeProjectMomentum,
    endowedProgressFraming,
    evaluateMilestones,
    projectProgress,
    type CoalitionProject,
    type EndowedProgressFraming,
    type ProjectMomentum,
} from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionProjectSupportRecord } from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { newProjectSupportId } from './coalitionStore';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordProjectSupportInput {
    projectId: string;
    supporterUserId: string;
    tipId: string;
    amountCents: number;
    currency?: string;
}

export interface RecordProjectSupportResult {
    project: CoalitionProject;
    support: CoalitionProjectSupportRecord;
    /** Milestones first crossed by this contribution — drives Milestone Broadcasts. */
    reachedMilestones: CoalitionProject['milestones'];
    /** True when this tip had already been recorded (the call was a no-op). */
    deduped: boolean;
}

/**
 * Record a captured contribution against a project. Idempotent on `tipId`: a
 * replayed capture returns the existing state without double-counting. Returns
 * null only when the referenced project no longer exists.
 */
export function recordProjectSupport(
    input: RecordProjectSupportInput
): RecordProjectSupportResult | null {
    const existingSupport = db.getCoalitionProjectSupportByTip(input.tipId);
    if (existingSupport) {
        const project = db.getCoalitionProject(existingSupport.projectId);
        if (!project) return null;
        return { project, support: existingSupport, reachedMilestones: [], deduped: true };
    }

    const project = db.getCoalitionProject(input.projectId);
    if (!project) return null;

    const support = db.addCoalitionProjectSupport({
        id: newProjectSupportId(),
        projectId: input.projectId,
        supporterUserId: input.supporterUserId,
        tipId: input.tipId,
        amountCents: input.amountCents,
        currency: input.currency,
    });

    const raisedCents = project.raisedCents + input.amountCents;
    const { milestones, reached } = evaluateMilestones(
        project.milestones,
        raisedCents,
        new Date().toISOString()
    );
    const updated = db.applyCoalitionProjectSupport(input.projectId, input.amountCents, milestones);
    const finalProject = updated ?? project;

    emitDomainEvent({
        module: 'monetization',
        type: 'coalition.project.support.recorded',
        payload: {
            projectId: finalProject.id,
            supporterUserId: input.supporterUserId,
            tipId: input.tipId,
            amountCents: input.amountCents,
            raisedCents: finalProject.raisedCents,
            supporterCount: finalProject.supporterCount,
        },
    });
    for (const milestone of reached) {
        emitDomainEvent({
            module: 'monetization',
            type: 'coalition.project.milestone.reached',
            payload: {
                projectId: finalProject.id,
                milestoneId: milestone.id,
                label: milestone.label,
                thresholdCents: milestone.thresholdCents,
                raisedCents: finalProject.raisedCents,
            },
        });
    }

    return { project: finalProject, support, reachedMilestones: reached, deduped: false };
}

export interface ProjectSupporterView {
    supporterUserId: string;
    amountCents: number;
    currency?: string;
    createdAt: string;
}

/** The supporter wall — recent contributors, newest first (social proof). */
export function listProjectSupporters(
    projectId: string,
    options: { limit?: number } = {}
): ProjectSupporterView[] {
    const limit = options.limit ?? 50;
    return db
        .listCoalitionProjectSupports({ projectId })
        .slice(0, limit)
        .map((s) => ({
            supporterUserId: s.supporterUserId,
            amountCents: s.amountCents,
            currency: s.currency,
            createdAt: s.createdAt,
        }));
}

export interface ProjectView {
    project: CoalitionProject;
    progress: number;
    momentum: ProjectMomentum;
    /** Endowed-progress framing, or null when the project has no funding goal. */
    endowedProgress: EndowedProgressFraming | null;
    recentSupporters: ProjectSupporterView[];
}

/** Read-side project view: progress, Momentum, endowed framing, social proof. */
export function getProjectView(projectId: string, nowMs: number = Date.now()): ProjectView | null {
    const project = db.getCoalitionProject(projectId);
    if (!project) return null;

    const supports = db.listCoalitionProjectSupports({ projectId });
    const last24 = new Date(nowMs - DAY_MS).toISOString();
    const prev24 = new Date(nowMs - 2 * DAY_MS).toISOString();
    const supportsLast24h = supports.filter((s) => s.createdAt >= last24).length;
    const supportsPrev24h = supports.filter(
        (s) => s.createdAt >= prev24 && s.createdAt < last24
    ).length;
    const raisedLast24hCents = supports
        .filter((s) => s.createdAt >= last24)
        .reduce((sum, s) => sum + s.amountCents, 0);

    const momentum = computeProjectMomentum({
        createdAt: project.createdAt,
        supportsLast24h,
        supportsPrev24h,
        raisedVelocityCentsPerHour: raisedLast24hCents / 24,
        nowMs,
    });

    return {
        project,
        progress: projectProgress(project),
        momentum,
        endowedProgress: endowedProgressFraming({
            raisedCents: project.raisedCents,
            goalCents: project.fundingGoalCents ?? 0,
        }),
        recentSupporters: listProjectSupporters(projectId, { limit: 20 }),
    };
}

/** Momentum-only helper for ranking project-backed feed items. */
export function projectMomentum(projectId: string, nowMs: number = Date.now()): number {
    const view = getProjectView(projectId, nowMs);
    return view?.momentum.momentum ?? 0;
}
