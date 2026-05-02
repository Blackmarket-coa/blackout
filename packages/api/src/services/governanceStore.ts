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

const meetings = new Map<string, GovernanceMeeting>();
const treasurySnapshots: GovernanceTreasurySnapshot[] = [];

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

export function __resetGovernanceStoreForTests(): void {
    meetings.clear();
    treasurySnapshots.length = 0;
}
