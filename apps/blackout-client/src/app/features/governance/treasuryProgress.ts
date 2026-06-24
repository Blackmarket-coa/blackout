import type { GovernanceTreasurySnapshotPayload } from '@blackout/protocol';

export interface MilestoneProgress {
    current: number;
    target: number;
    percent: number;
    met: boolean;
}

/**
 * Parse a snapshot's string-encoded balance into a number for thermometer math.
 * Tolerant of thousands separators and stray spaces; returns 0 for anything
 * unparseable so a malformed line never breaks the bar.
 */
export function parseBalance(raw: string | undefined | null): number {
    if (!raw) return 0;
    const n = Number.parseFloat(raw.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/** The balance for one asset in a snapshot, or 0 if absent. */
export function balanceForAsset(
    snapshot: GovernanceTreasurySnapshotPayload | null | undefined,
    asset: string,
): number {
    if (!snapshot) return 0;
    const line = snapshot.lines.find((entry) => entry.asset === asset);
    return parseBalance(line?.balance);
}

/**
 * Treasury milestone progress: the treasury's current balance for the asset vs.
 * the milestone target. Aggregate by nature — a community balance against a
 * shared goal, with no individual attribution.
 */
export function milestoneProgress(target: number, currentBalance: number): MilestoneProgress {
    const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
    const current = Number.isFinite(currentBalance) && currentBalance > 0 ? currentBalance : 0;
    const percent =
        safeTarget > 0 ? Math.min(100, Math.max(0, Math.round((current / safeTarget) * 100))) : 0;
    return {
        current,
        target: safeTarget,
        percent,
        met: safeTarget > 0 && current >= safeTarget,
    };
}
