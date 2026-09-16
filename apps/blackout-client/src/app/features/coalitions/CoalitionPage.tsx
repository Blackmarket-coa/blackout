import React, { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
    CAMPAIGN_TYPES,
    COALITION_JOIN_MODES,
    COALITION_ROLE_LABELS,
    COALITION_TIER_GATES,
    assignableRolesFor,
    type CampaignStatus,
    type CampaignType,
    type CoalitionJoinMode,
    type CoalitionRole,
    type CoalitionTierGate,
} from '@blackout/core';
import {
    approveCampaign,
    archiveCoalition,
    boostCampaign,
    createCampaign,
    fetchCoalition,
    fetchJoinRequests,
    joinCoalition,
    leaveCoalition,
    removeMember,
    reviewJoinRequest,
    setCampaignStatus,
    setMemberRole,
    updateCoalition,
    withdrawJoinRequest,
    type CoalitionCampaignView,
    type CoalitionView,
    type JoinRequestView,
} from './coalitionsClient';
import {
    buttonStyle,
    cardStyle,
    formatCents,
    inputStyle,
    meterFillStyle,
    meterTrackStyle,
    mutedStyle,
    nameStyle,
    roleChipStyle,
    rowStyle,
    sectionLabelStyle,
    statTileStyle,
} from './coalitionsStyles';

const PAGE_STYLE: CSSProperties = {
    height: '100%',
    overflow: 'auto',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
};

const CONTAINER_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: 16,
    maxWidth: 980,
    margin: '0 auto',
};

const BANNER_STYLE: CSSProperties = {
    width: '100%',
    height: 160,
    objectFit: 'cover',
    borderRadius: 12,
    background: 'linear-gradient(120deg, var(--bg-input) 0%, var(--accent-primary, #1ABC9C) 140%)',
};

const headingStyle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
    drive: 'Drive',
    project: 'Project',
    boost: 'Boost',
    mutual_aid: 'Mutual aid',
    goods_drive: 'Goods drive',
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
    draft: 'Draft',
    pending_approval: 'Awaiting Steward',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

function StatTile({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={statTileStyle}>
            <span
                style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                {label}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{value}</span>
        </div>
    );
}

function CampaignCard({
    coalitionId,
    campaign,
    canApprove,
    isMember,
    onChanged,
}: {
    coalitionId: string;
    campaign: CoalitionCampaignView;
    canApprove: boolean;
    isMember: boolean;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const run = async (fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        try {
            await fn();
            onChanged();
        } catch (error) {
            setNote(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };
    const goal = campaign.goalCents ?? 0;
    const fraction = goal > 0 ? campaign.raisedCents / goal : 0;
    const boost = campaign.boost;
    return (
        <div style={cardStyle} data-testid="coalition-campaign">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                }}
            >
                <strong>{campaign.title}</strong>
                <span style={roleChipStyle}>{CAMPAIGN_TYPE_LABELS[campaign.type]}</span>
            </div>
            {campaign.description ? (
                <span style={{ ...mutedStyle, whiteSpace: 'pre-wrap' }}>
                    {campaign.description}
                </span>
            ) : null}
            <span style={mutedStyle}>{STATUS_LABELS[campaign.status]}</span>
            {goal > 0 ? (
                <div style={{ display: 'grid', gap: 4 }}>
                    <div style={meterTrackStyle} aria-hidden="true">
                        <div style={meterFillStyle(fraction)} />
                    </div>
                    <span style={mutedStyle}>
                        {formatCents(campaign.raisedCents)} of {formatCents(goal)} ·{' '}
                        {campaign.contributorCount} contributors
                    </span>
                </div>
            ) : null}
            {boost ? (
                <div style={{ display: 'grid', gap: 4 }} data-testid="coalition-boost-meter">
                    <div style={meterTrackStyle} aria-hidden="true">
                        <div style={meterFillStyle(Math.min(1, boost.total / 25))} />
                    </div>
                    <span style={mutedStyle}>
                        Boost meter: {boost.total} boosts from {boost.members} members · ×
                        {boost.visibilityMultiplier.toFixed(2)} reach
                    </span>
                </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isMember && campaign.status === 'active' ? (
                    <button
                        type="button"
                        style={buttonStyle('primary')}
                        disabled={busy}
                        onClick={() => void run(() => boostCampaign(coalitionId, campaign.id))}
                        data-testid="coalition-campaign-boost"
                    >
                        Boost
                    </button>
                ) : null}
                {canApprove && campaign.status === 'pending_approval' ? (
                    <button
                        type="button"
                        style={buttonStyle('primary')}
                        disabled={busy}
                        onClick={() => void run(() => approveCampaign(coalitionId, campaign.id))}
                        data-testid="coalition-campaign-approve"
                    >
                        Approve
                    </button>
                ) : null}
                {canApprove && campaign.status === 'active' ? (
                    <button
                        type="button"
                        style={buttonStyle('subtle')}
                        disabled={busy}
                        onClick={() =>
                            void run(() => setCampaignStatus(coalitionId, campaign.id, 'completed'))
                        }
                    >
                        Mark completed
                    </button>
                ) : null}
                {canApprove &&
                (campaign.status === 'active' || campaign.status === 'pending_approval') ? (
                    <button
                        type="button"
                        style={buttonStyle('danger')}
                        disabled={busy}
                        onClick={() =>
                            void run(() => setCampaignStatus(coalitionId, campaign.id, 'cancelled'))
                        }
                    >
                        Cancel
                    </button>
                ) : null}
            </div>
            {note ? (
                <span style={{ fontSize: 12, color: 'var(--danger, #f04747)' }}>{note}</span>
            ) : null}
        </div>
    );
}

function NewCampaignForm({
    coalitionId,
    canLaunch,
    onCreated,
}: {
    coalitionId: string;
    canLaunch: boolean;
    onCreated: () => void;
}) {
    const [type, setType] = useState<CampaignType>('drive');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [goal, setGoal] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const goalCents = goal.trim() ? Math.round(Number.parseFloat(goal) * 100) : undefined;
            await createCampaign(coalitionId, {
                type,
                title: title.trim(),
                description: description.trim(),
                ...(goalCents && goalCents > 0 ? { goalCents } : {}),
            });
            setTitle('');
            setDescription('');
            setGoal('');
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the campaign');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} style={{ ...cardStyle }} data-testid="coalition-campaign-form">
            <strong>{canLaunch ? 'Launch a campaign' : 'Propose a campaign'}</strong>
            {!canLaunch ? (
                <span style={mutedStyle}>A Steward reviews proposals before they go live.</span>
            ) : null}
            <select
                style={inputStyle}
                value={type}
                onChange={(e) => setType(e.target.value as CampaignType)}
            >
                {CAMPAIGN_TYPES.map((value) => (
                    <option key={value} value={value}>
                        {CAMPAIGN_TYPE_LABELS[value]}
                    </option>
                ))}
            </select>
            <input
                style={inputStyle}
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
            />
            <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                placeholder="What is this for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
            />
            {type === 'drive' || type === 'project' || type === 'goods_drive' ? (
                <input
                    style={inputStyle}
                    placeholder="Goal in dollars (optional)"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    inputMode="decimal"
                />
            ) : null}
            {error ? (
                <span style={{ fontSize: 12, color: 'var(--danger, #f04747)' }}>{error}</span>
            ) : null}
            <div>
                <button type="submit" style={buttonStyle('primary')} disabled={busy}>
                    {canLaunch ? 'Launch' : 'Propose'}
                </button>
            </div>
        </form>
    );
}

function EditCoalitionForm({ view, onSaved }: { view: CoalitionView; onSaved: () => void }) {
    const navigate = useNavigate();
    const { coalition } = view;
    const [name, setName] = useState(coalition.name);
    const [mission, setMission] = useState(coalition.mission);
    const [joinMode, setJoinMode] = useState<CoalitionJoinMode>(coalition.joinMode);
    const [minTier, setMinTier] = useState<CoalitionTierGate | ''>(coalition.minTierToJoin ?? '');
    const [bannerUrl, setBannerUrl] = useState(coalition.bannerUrl ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canArchive = view.viewer.permissions.includes('coalition.archive');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const saved = await updateCoalition(coalition.id, {
                name: name.trim(),
                mission: mission.trim(),
                joinMode,
                minTierToJoin: minTier || null,
                bannerUrl: bannerUrl.trim() || null,
            });
            if (saved.coalition.slug !== coalition.slug) {
                navigate(`/coalitions/${encodeURIComponent(saved.coalition.slug)}`, {
                    replace: true,
                });
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} style={cardStyle} data-testid="coalition-edit-form">
            <strong>Edit coalition</strong>
            <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
            />
            <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                required
                maxLength={2000}
            />
            <select
                style={inputStyle}
                value={joinMode}
                onChange={(e) => setJoinMode(e.target.value as CoalitionJoinMode)}
                data-testid="coalition-edit-join-mode"
            >
                {COALITION_JOIN_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                        {mode === 'open'
                            ? 'Open — anyone can join'
                            : 'Approval — Stewards review requests'}
                    </option>
                ))}
            </select>
            <span style={mutedStyle}>
                Changing how people join never removes anyone already in.
            </span>
            <select
                style={inputStyle}
                value={minTier}
                onChange={(e) => setMinTier(e.target.value as CoalitionTierGate | '')}
            >
                <option value="">No minimum tier</option>
                {COALITION_TIER_GATES.map((tier) => (
                    <option key={tier} value={tier}>
                        {tier}+
                    </option>
                ))}
            </select>
            <input
                style={inputStyle}
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                type="url"
                placeholder="Banner image URL"
            />
            {error ? (
                <span style={{ fontSize: 12, color: 'var(--danger, #f04747)' }}>{error}</span>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={buttonStyle('primary')} disabled={busy}>
                    Save
                </button>
                {canArchive ? (
                    <button
                        type="button"
                        style={buttonStyle('danger')}
                        disabled={busy}
                        onClick={() => {
                            if (
                                window.confirm(
                                    'Archive this coalition? It leaves the directory and refuses new joins.'
                                )
                            ) {
                                void archiveCoalition(coalition.id).then(() =>
                                    navigate('/coalitions')
                                );
                            }
                        }}
                    >
                        Archive
                    </button>
                ) : null}
            </div>
        </form>
    );
}

/**
 * `/coalitions/:id` — the coalition mini-profile: banner, mission, impact
 * stats, active campaigns, roster with roles, and the join / request / leave
 * flow. Stewards additionally see the join-request queue and campaign
 * approvals. Every action is authorised on the server; the page only decides
 * what to show from `viewer.permissions`.
 */
export const CoalitionPage = () => {
    const { id } = useParams();
    const [view, setView] = useState<CoalitionView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requests, setRequests] = useState<JoinRequestView[]>([]);
    const [joinMessage, setJoinMessage] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const decoded = id ? decodeURIComponent(id) : '';

    const load = useCallback(async () => {
        if (!decoded) return;
        try {
            const next = await fetchCoalition(decoded);
            setView(next);
            setError(null);
            if (next.viewer.permissions.includes('members.approve')) {
                setRequests(await fetchJoinRequests(next.coalition.id).catch(() => []));
            } else {
                setRequests([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Coalition not found');
        }
    }, [decoded]);

    useEffect(() => {
        void load();
    }, [load]);

    const run = async (fn: () => Promise<unknown>, done?: string) => {
        if (busy) return;
        setBusy(true);
        setNotice(null);
        try {
            await fn();
            if (done) setNotice(done);
            await load();
        } catch (err) {
            setNotice(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    if (error) {
        return (
            <div style={PAGE_STYLE}>
                <div style={CONTAINER_STYLE}>
                    <p style={mutedStyle}>{error}</p>
                    <Link to="/coalitions">Back to coalitions</Link>
                </div>
            </div>
        );
    }
    if (!view) {
        return (
            <div style={PAGE_STYLE}>
                <div style={CONTAINER_STYLE}>
                    <p style={mutedStyle}>Loading…</p>
                </div>
            </div>
        );
    }

    const { coalition, viewer, members, campaigns, stats, hiddenMemberCount } = view;
    const membership = viewer.membership;
    const permissions = viewer.permissions;
    const can = (permission: string) => permissions.includes(permission as never);
    const isMember = Boolean(membership);
    const actorRole: CoalitionRole | undefined = membership?.role;
    const pendingRequest = viewer.request;

    return (
        <div style={PAGE_STYLE} data-testid="coalition-page">
            <div style={CONTAINER_STYLE}>
                {coalition.bannerUrl ? (
                    <img src={coalition.bannerUrl} alt="" style={BANNER_STYLE} />
                ) : (
                    <div style={BANNER_STYLE} aria-hidden="true" />
                )}
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'grid', gap: 6 }}>
                        <h1 style={{ margin: 0, fontSize: 24 }}>{coalition.name}</h1>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {coalition.mission}
                        </p>
                        <span style={mutedStyle}>
                            {coalition.joinMode === 'open' ? 'Open to join' : 'Join by approval'}
                            {coalition.minTierToJoin ? ` · ${coalition.minTierToJoin}+ tier` : ''}
                            {coalition.archivedAt ? ' · Archived' : ''}
                        </span>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                        }}
                    >
                        {actorRole ? (
                            <span style={roleChipStyle}>
                                You: {COALITION_ROLE_LABELS[actorRole]}
                            </span>
                        ) : null}
                        {!isMember && !pendingRequest && !coalition.archivedAt ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                                {coalition.joinMode === 'approval' ? (
                                    <input
                                        style={inputStyle}
                                        placeholder="A note for the Stewards (optional)"
                                        value={joinMessage}
                                        onChange={(e) => setJoinMessage(e.target.value)}
                                        maxLength={500}
                                    />
                                ) : null}
                                <button
                                    type="button"
                                    style={buttonStyle('primary')}
                                    disabled={busy}
                                    data-testid="coalition-join"
                                    onClick={() =>
                                        void run(
                                            () =>
                                                joinCoalition(
                                                    coalition.id,
                                                    joinMessage.trim() || undefined
                                                ),
                                            coalition.joinMode === 'open'
                                                ? 'Welcome in.'
                                                : 'Request sent to the Stewards.'
                                        )
                                    }
                                >
                                    {coalition.joinMode === 'open' ? 'Join' : 'Request to join'}
                                </button>
                            </div>
                        ) : null}
                        {!isMember && pendingRequest?.status === 'pending' ? (
                            <button
                                type="button"
                                style={buttonStyle('subtle')}
                                disabled={busy}
                                onClick={() =>
                                    void run(
                                        () => withdrawJoinRequest(coalition.id),
                                        'Request withdrawn.'
                                    )
                                }
                            >
                                Requested · withdraw
                            </button>
                        ) : null}
                        {!isMember && pendingRequest?.status === 'invited' ? (
                            <button
                                type="button"
                                style={buttonStyle('primary')}
                                disabled={busy}
                                data-testid="coalition-accept-invite"
                                onClick={() =>
                                    void run(
                                        () => joinCoalition(coalition.id),
                                        'Invitation accepted.'
                                    )
                                }
                            >
                                Accept invitation
                            </button>
                        ) : null}
                        {isMember && actorRole !== 'founder' ? (
                            <button
                                type="button"
                                style={buttonStyle('danger')}
                                disabled={busy}
                                data-testid="coalition-leave"
                                onClick={() =>
                                    void run(
                                        () => leaveCoalition(coalition.id),
                                        'You left the coalition.'
                                    )
                                }
                            >
                                Leave
                            </button>
                        ) : null}
                        {can('coalition.edit') ? (
                            <button
                                type="button"
                                style={buttonStyle('subtle')}
                                onClick={() => setEditing((v) => !v)}
                                data-testid="coalition-edit-toggle"
                            >
                                {editing ? 'Close editor' : 'Edit'}
                            </button>
                        ) : null}
                    </div>
                </header>

                {notice ? (
                    <div role="status" style={{ fontSize: 13 }} data-testid="coalition-notice">
                        {notice}
                    </div>
                ) : null}

                {editing && can('coalition.edit') ? (
                    <EditCoalitionForm
                        view={view}
                        onSaved={() => {
                            setEditing(false);
                            void load();
                        }}
                    />
                ) : null}

                <div
                    style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                    data-testid="coalition-stats"
                >
                    <StatTile label="Members" value={stats.memberCount} />
                    <StatTile label="Active campaigns" value={stats.activeCampaigns} />
                    <StatTile label="Funds raised" value={formatCents(stats.fundsRaisedCents)} />
                    <StatTile label="Drives completed" value={stats.drivesCompleted} />
                </div>

                {can('members.approve') && requests.length > 0 ? (
                    <section
                        style={{ display: 'grid', gap: 8 }}
                        data-testid="coalition-request-queue"
                    >
                        <h2 style={headingStyle}>Join requests — {requests.length}</h2>
                        {requests.map((request) => (
                            <div key={request.id} style={rowStyle} data-testid="coalition-request">
                                <span style={nameStyle} title={request.message}>
                                    {request.user.username}
                                    {request.message ? (
                                        <span style={{ ...mutedStyle, marginLeft: 8 }}>
                                            “{request.message}”
                                        </span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    style={buttonStyle('primary')}
                                    disabled={busy}
                                    data-testid="coalition-request-approve"
                                    onClick={() =>
                                        void run(() =>
                                            reviewJoinRequest(
                                                coalition.id,
                                                request.userId,
                                                'approve'
                                            )
                                        )
                                    }
                                >
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    style={buttonStyle('danger')}
                                    disabled={busy}
                                    onClick={() =>
                                        void run(() =>
                                            reviewJoinRequest(
                                                coalition.id,
                                                request.userId,
                                                'decline'
                                            )
                                        )
                                    }
                                >
                                    Decline
                                </button>
                            </div>
                        ))}
                    </section>
                ) : null}

                <section style={{ display: 'grid', gap: 10 }}>
                    <h2 style={headingStyle}>Campaigns</h2>
                    {campaigns.length === 0 ? (
                        <span style={mutedStyle}>No campaigns yet.</span>
                    ) : null}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 12,
                        }}
                    >
                        {campaigns.map((campaign) => (
                            <CampaignCard
                                key={campaign.id}
                                coalitionId={coalition.id}
                                campaign={campaign}
                                canApprove={can('campaigns.approve')}
                                isMember={isMember}
                                onChanged={() => void load()}
                            />
                        ))}
                    </div>
                    {isMember && !coalition.archivedAt ? (
                        <NewCampaignForm
                            coalitionId={coalition.id}
                            canLaunch={can('campaigns.launch')}
                            onCreated={() => void load()}
                        />
                    ) : null}
                </section>

                <section style={{ display: 'grid', gap: 4 }}>
                    <h2 style={headingStyle}>
                        Members — {stats.memberCount}
                        {hiddenMemberCount > 0 ? ` · ${members.length} shown` : ''}
                    </h2>
                    <div style={sectionLabelStyle}>Roster</div>
                    {members.map((member) => {
                        const assignable = actorRole ? assignableRolesFor(actorRole) : [];
                        const canEditRole =
                            can('members.role') &&
                            member.role !== 'founder' &&
                            member.userId !== membership?.userId;
                        const canRemove =
                            can('members.remove') &&
                            member.role !== 'founder' &&
                            member.userId !== membership?.userId;
                        return (
                            <div
                                key={member.userId}
                                style={rowStyle}
                                data-testid="coalition-member"
                            >
                                {member.matrixUserId ? (
                                    <Link
                                        to={`/profile/${encodeURIComponent(member.matrixUserId)}`}
                                        style={{
                                            ...nameStyle,
                                            color: 'inherit',
                                            textDecoration: 'none',
                                        }}
                                    >
                                        {member.username}
                                    </Link>
                                ) : (
                                    <span style={nameStyle}>{member.username}</span>
                                )}
                                {canEditRole && assignable.length > 0 ? (
                                    <select
                                        style={{
                                            ...inputStyle,
                                            width: 'auto',
                                            padding: '4px 8px',
                                            fontSize: 12,
                                        }}
                                        value={member.role}
                                        disabled={busy}
                                        data-testid="coalition-member-role"
                                        onChange={(e) =>
                                            void run(() =>
                                                setMemberRole(
                                                    coalition.id,
                                                    member.userId,
                                                    e.target.value as CoalitionRole
                                                )
                                            )
                                        }
                                    >
                                        {[
                                            member.role,
                                            ...assignable.filter((r) => r !== member.role),
                                        ].map((role) => (
                                            <option key={role} value={role}>
                                                {COALITION_ROLE_LABELS[role]}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span style={roleChipStyle}>
                                        {COALITION_ROLE_LABELS[member.role]}
                                    </span>
                                )}
                                {canRemove ? (
                                    <button
                                        type="button"
                                        style={buttonStyle('danger')}
                                        disabled={busy}
                                        onClick={() =>
                                            void run(() =>
                                                removeMember(coalition.id, member.userId)
                                            )
                                        }
                                    >
                                        Remove
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </section>
            </div>
        </div>
    );
};

export default CoalitionPage;
