export type GovernanceMeetingStatus =
    | 'scheduled'
    | 'in_progress'
    | 'completed'
    | 'cancelled';

export interface GovernanceMeetingAttendee {
    id: string;
    label?: string;
}

export interface GovernanceMeeting {
    meetingId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    agenda?: string;
    location?: string;
    attendees: GovernanceMeetingAttendee[];
    relatedProposalId?: string;
    status: GovernanceMeetingStatus;
}

export interface GovernanceTreasuryLine {
    asset: string;
    balance: string;
    delta24h?: string;
}

export interface GovernanceTreasurySnapshot {
    snapshotId: string;
    generatedAt: string;
    lines: GovernanceTreasuryLine[];
    totalReference?: { currency: string; amount: string };
}

export type TreasuryMilestoneStatus = 'active' | 'met' | 'archived';

export interface GovernanceTreasuryMilestone {
    milestoneId: string;
    title: string;
    asset: string;
    target: number;
    status: TreasuryMilestoneStatus;
    accent?: string;
    createdAt: string;
    metAt?: string;
}

const meetings = new Map<string, GovernanceMeeting>();
const treasurySnapshots: GovernanceTreasurySnapshot[] = [];
const treasuryMilestones = new Map<string, GovernanceTreasuryMilestone>();

export function listMeetings(filter: { proposalId?: string } = {}): GovernanceMeeting[] {
    const all = [...meetings.values()];
    const filtered = filter.proposalId
        ? all.filter((meeting) => meeting.relatedProposalId === filter.proposalId)
        : all;
    return filtered.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function upsertMeeting(input: GovernanceMeeting): GovernanceMeeting {
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
        throw new Error('endsAt_must_be_after_startsAt');
    }
    meetings.set(input.meetingId, { ...input });
    return meetings.get(input.meetingId)!;
}

export function cancelMeeting(meetingId: string): GovernanceMeeting | null {
    const existing = meetings.get(meetingId);
    if (!existing) return null;
    const cancelled: GovernanceMeeting = { ...existing, status: 'cancelled' };
    meetings.set(meetingId, cancelled);
    return cancelled;
}

export function publishTreasurySnapshot(input: GovernanceTreasurySnapshot): GovernanceTreasurySnapshot {
    treasurySnapshots.push({ ...input, lines: [...input.lines] });
    treasurySnapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return treasurySnapshots[0]!;
}

export function getLatestTreasurySnapshot(): GovernanceTreasurySnapshot | null {
    return treasurySnapshots[0] ?? null;
}

export function listTreasurySnapshots(options: { cursor?: string; limit?: number } = {}): {
    items: GovernanceTreasurySnapshot[];
    nextCursor?: string;
} {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    let start = 0;
    if (options.cursor) {
        const idx = treasurySnapshots.findIndex(
            (snapshot) => snapshot.snapshotId === options.cursor,
        );
        start = idx >= 0 ? idx : treasurySnapshots.length;
    }
    const slice = treasurySnapshots.slice(start, start + limit);
    const next = treasurySnapshots[start + limit];
    return { items: slice, nextCursor: next?.snapshotId };
}

/**
 * Create or update a treasury milestone (keyed by `milestoneId`). Re-upserting
 * the same id edits the goal — including flipping `status` to `met`/`archived`.
 */
export function upsertTreasuryMilestone(
    input: GovernanceTreasuryMilestone,
): GovernanceTreasuryMilestone {
    if (!Number.isFinite(input.target) || input.target <= 0) {
        throw new Error('target_must_be_positive');
    }
    treasuryMilestones.set(input.milestoneId, { ...input });
    return treasuryMilestones.get(input.milestoneId)!;
}

/** List milestones, newest first. Archived ones are excluded unless requested. */
export function listTreasuryMilestones(
    options: { includeArchived?: boolean } = {},
): GovernanceTreasuryMilestone[] {
    const all = [...treasuryMilestones.values()];
    const filtered = options.includeArchived
        ? all
        : all.filter((milestone) => milestone.status !== 'archived');
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTreasuryMilestone(milestoneId: string): GovernanceTreasuryMilestone | null {
    return treasuryMilestones.get(milestoneId) ?? null;
}

export function __resetGovernanceStoreForTests(): void {
    meetings.clear();
    treasurySnapshots.length = 0;
    treasuryMilestones.clear();
}
