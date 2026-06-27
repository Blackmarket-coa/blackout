// Bounty-board room view. Rendered in place of the chat timeline when a room is
// marked `co.bmc.room_type: bounty_board`. Bounties are `co.bmc.bounty` state
// events (the immutable Matrix audit trail); FBM stays authoritative via the
// bounties API. Posting writes the state event AND calls createBounty so both
// records stay in step.
import React, { type CSSProperties, useMemo, useState } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import {
    BOUNTY_EVENT_TYPE,
    isBountyStateContent,
    type BountyStateContent,
    type BountyStateStatus,
} from '@blackout/protocol';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { createBounty } from '../bounty/bountyClient';

const TABS: Array<{ id: BountyStateStatus; label: string }> = [
    { id: 'open', label: 'Open' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'complete', label: 'Complete' },
];

const layoutStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.2fr)',
    gap: 16,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
};
const colStyle: CSSProperties = { display: 'grid', gap: 10, alignContent: 'start', minWidth: 0 };
const tabRowStyle: CSSProperties = { display: 'flex', gap: 6 };
const tabStyle = (active: boolean): CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-default)'}`,
    background: active ? 'var(--bg-accent, var(--bg-surface-low))' : 'transparent',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
});
const cardStyle = (selected: boolean): CSSProperties => ({
    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 4,
    cursor: 'pointer',
    textAlign: 'left',
});
const titleStyle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };
const rewardStyle: CSSProperties = { fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600 };
const mutedStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const detailStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 16,
    display: 'grid',
    gap: 10,
    alignContent: 'start',
};
const inputStyle: CSSProperties = {
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input, var(--bg-surface-low))',
    color: 'var(--text-primary)',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
};
const buttonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary)',
    background: 'var(--bg-accent, transparent)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

function readBounties(room: Room): BountyStateContent[] {
    const events = room.currentState.getStateEvents(BOUNTY_EVENT_TYPE) as MatrixEvent[];
    const out: BountyStateContent[] = [];
    for (const event of events) {
        const content = event.getContent();
        if (isBountyStateContent(content)) out.push(content);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const PostBountyForm = ({ onPost, posting }: { onPost: (b: { title: string; description: string; reward: string }) => void; posting: boolean }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reward, setReward] = useState('');
    return (
        <form
            style={detailStyle}
            onSubmit={(e) => {
                e.preventDefault();
                if (title.trim() && reward.trim()) onPost({ title, description, reward });
            }}
        >
            <div style={titleStyle}>Post a bounty</div>
            <input style={inputStyle} placeholder="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
            <textarea
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                placeholder="Describe the deliverable"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <input style={inputStyle} placeholder='Reward, e.g. "$50" or "10% rev-share"' value={reward} onChange={(e) => setReward(e.currentTarget.value)} />
            <button type="submit" style={buttonStyle} disabled={posting}>
                {posting ? 'Posting…' : 'Post bounty'}
            </button>
        </form>
    );
};

export function BountyBoardRoom({ room }: { room: Room }) {
    const mx = useMatrixClient();
    const [tab, setTab] = useState<BountyStateStatus>('open');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [version, setVersion] = useState(0);

    const bounties = useMemo(() => readBounties(room), [room, version]);
    const visible = bounties.filter((b) => b.status === tab);
    const selected = bounties.find((b) => b.bountyId === selectedId) ?? null;

    const handlePost = async ({ title, description, reward }: { title: string; description: string; reward: string }) => {
        setPosting(true);
        try {
            // FBM is authoritative; create there first to mint the id.
            const { bounty } = await createBounty({
                category: 'creator',
                title,
                description,
                rewardType: 'cash',
                rewardSummary: reward,
            });
            const content: BountyStateContent = {
                bountyId: bounty.id,
                title,
                description,
                rewardSummary: reward,
                status: 'open',
                creatorId: mx.getSafeUserId(),
                createdAt: bounty.createdAt ?? new Date().toISOString(),
            };
            // Matrix state event = immutable audit trail.
            await mx.sendStateEvent(room.roomId, BOUNTY_EVENT_TYPE as never, content as never, bounty.id);
            setVersion((v) => v + 1);
            setTab('open');
            setSelectedId(bounty.id);
        } catch {
            // Surface nothing destructive; the board stays usable.
        } finally {
            setPosting(false);
        }
    };

    return (
        <div style={layoutStyle} data-testid="bounty-board-room">
            <div style={colStyle}>
                <div style={tabRowStyle}>
                    {TABS.map((t) => (
                        <button key={t.id} type="button" style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>
                {visible.length === 0 ? (
                    <div style={mutedStyle}>No {tab.replace('_', ' ')} bounties.</div>
                ) : (
                    visible.map((b) => (
                        <button
                            key={b.bountyId}
                            type="button"
                            style={cardStyle(b.bountyId === selectedId)}
                            onClick={() => setSelectedId(b.bountyId)}
                        >
                            <div style={titleStyle}>{b.title}</div>
                            <div style={rewardStyle}>{b.rewardSummary}</div>
                            {b.deadline ? <div style={mutedStyle}>Deadline: {b.deadline}</div> : null}
                        </button>
                    ))
                )}
            </div>
            <div style={colStyle}>
                {selected ? (
                    <div style={detailStyle}>
                        <div style={titleStyle}>{selected.title}</div>
                        <div style={rewardStyle}>{selected.rewardSummary}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{selected.description}</div>
                        <div style={mutedStyle}>Status: {selected.status.replace('_', ' ')}</div>
                        <div style={mutedStyle}>Posted by {selected.creatorId}</div>
                        {selected.claimedBy ? <div style={mutedStyle}>Claimed by {selected.claimedBy}</div> : null}
                    </div>
                ) : (
                    <PostBountyForm onPost={handlePost} posting={posting} />
                )}
            </div>
        </div>
    );
}

export default BountyBoardRoom;
