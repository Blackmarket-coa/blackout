import { type CSSProperties, useMemo, useState } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { readPowerLevel, usePowerLevels } from '../../hooks/usePowerLevels';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { RoleEditor } from '../roles/RoleEditor';
import { AutoModPanel } from '../moderation/AutoModPanel';
import { InvitationsManager } from '../../components/invitations';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

type Tab = 'overview' | 'roles' | 'invites' | 'moderation';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(860px, 100%)',
    height: 'min(620px, 100%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
    border: 'none',
    background: active ? 'var(--bg-hover, rgba(255,255,255,0.08))' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    textAlign: 'left',
});

const inputStyle: CSSProperties = {
    width: '100%',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
};

const primaryButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const fieldLabelStyle: CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-muted)',
    margin: '12px 0 4px',
};

const readTopic = (room: Room): string =>
    room.currentState.getStateEvents('m.room.topic', '')?.getContent<{ topic?: string }>()?.topic ??
    '';

const OverviewTab = ({ canopy }: { canopy: Room }) => {
    const mx = useMatrixClient();
    const [name, setName] = useState(canopy.name ?? '');
    const [topic, setTopic] = useState(() => readTopic(canopy));
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        setStatus(null);
        try {
            await mx.sendStateEvent(canopy.roomId, 'm.room.name' as any, { name: name.trim() }, '');
            await mx.sendStateEvent(canopy.roomId, 'm.room.topic' as any, { topic }, '');
            setStatus('Saved.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <label style={fieldLabelStyle} htmlFor="canopy-name">
                {BLACKOUT_TERMS.canopy.title} name
            </label>
            <input
                id="canopy-name"
                style={inputStyle}
                value={name}
                onChange={(event) => setName(event.target.value)}
            />
            <label style={fieldLabelStyle} htmlFor="canopy-topic">
                Description
            </label>
            <textarea
                id="canopy-topic"
                style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button
                    type="button"
                    style={primaryButtonStyle}
                    disabled={busy}
                    onClick={() => void save()}
                >
                    {busy ? 'Saving…' : 'Save changes'}
                </button>
                {status ? <small style={{ color: 'var(--text-muted)' }}>{status}</small> : null}
            </div>
        </div>
    );
};

const secondaryButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const InvitesTab = ({ canopy }: { canopy: Room }) => {
    const mx = useMatrixClient();
    const [mxid, setMxid] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [linksOpen, setLinksOpen] = useState(false);

    const invite = async () => {
        const target = mxid.trim();
        if (!target || busy) return;
        setBusy(true);
        setStatus(null);
        try {
            await mx.invite(canopy.roomId, target);
            setStatus(`Invited ${target}.`);
            setMxid('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not invite.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Invite someone to this {BLACKOUT_TERMS.canopy.singular} by their Matrix ID.
            </p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void invite();
                }}
                style={{ display: 'flex', gap: 8 }}
            >
                <input
                    style={inputStyle}
                    value={mxid}
                    onChange={(event) => setMxid(event.target.value)}
                    placeholder="@user:server"
                    aria-label="Matrix ID"
                />
                <button type="submit" style={primaryButtonStyle} disabled={busy || !mxid.trim()}>
                    Invite
                </button>
            </form>
            {status ? (
                <small style={{ display: 'block', marginTop: 10, color: 'var(--text-muted)' }}>
                    {status}
                </small>
            ) : null}

            <hr
                style={{
                    border: 'none',
                    borderTop: '1px solid var(--border-default)',
                    margin: '20px 0 16px',
                }}
            />
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Or create a shareable link anyone can use to join this{' '}
                {BLACKOUT_TERMS.canopy.singular}.
            </p>
            <button
                type="button"
                style={secondaryButtonStyle}
                data-testid="canopy-invite-links-open"
                onClick={() => setLinksOpen(true)}
            >
                Create shareable invite link
            </button>

            {linksOpen ? (
                <InvitationsManager
                    roomId={canopy.roomId}
                    requestClose={() => setLinksOpen(false)}
                />
            ) : null}
        </div>
    );
};

/**
 * Canopy settings/admin surface. A thin composition over existing features:
 * an overview editor, the existing `RoleEditor` for roles & permissions, an
 * invite-by-MXID form, and the existing `AutoModPanel` for moderation (only
 * when the `moderation` feature flag is on).
 */
export const CanopySettingsDialog = ({
    canopy,
    onClose,
}: {
    canopy: Room;
    onClose: () => void;
}) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(canopy);
    const [tab, setTab] = useState<Tab>('overview');
    const moderationEnabled = runtimeFeatureFlags.moderation;
    const canInvite =
        readPowerLevel.user(powerLevels, mx.getUserId() ?? undefined) >=
        readPowerLevel.action(powerLevels, 'invite');

    const tabs = useMemo(
        () => [
            { id: 'overview' as const, label: 'Overview' },
            { id: 'roles' as const, label: 'Roles & permissions' },
            ...(canInvite ? [{ id: 'invites' as const, label: 'Invites' }] : []),
            ...(moderationEnabled ? [{ id: 'moderation' as const, label: 'Moderation' }] : []),
        ],
        [canInvite, moderationEnabled]
    );

    return (
        <div
            style={OVERLAY_STYLE}
            role="dialog"
            aria-modal="true"
            aria-label={`${canopy.name} settings`}
            data-testid="canopy-settings-dialog"
            onClick={onClose}
        >
            <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--border-default)',
                    }}
                >
                    <strong style={{ fontSize: 16 }}>{canopy.name} · Settings</strong>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close settings"
                        style={{
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            borderRadius: 8,
                            width: 30,
                            height: 30,
                            cursor: 'pointer',
                        }}
                    >
                        ✕
                    </button>
                </header>
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <nav
                        style={{
                            width: 200,
                            flex: '0 0 200px',
                            borderRight: '1px solid var(--border-default)',
                            padding: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        {tabs.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                style={tabButtonStyle(tab === entry.id)}
                                onClick={() => setTab(entry.id)}
                                data-testid={`canopy-settings-tab-${entry.id}`}
                            >
                                {entry.label}
                            </button>
                        ))}
                    </nav>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
                        {tab === 'overview' ? <OverviewTab canopy={canopy} /> : null}
                        {tab === 'roles' ? <RoleEditor roomId={canopy.roomId} /> : null}
                        {tab === 'invites' ? <InvitesTab canopy={canopy} /> : null}
                        {tab === 'moderation' && moderationEnabled ? (
                            <AutoModPanel roomId={canopy.roomId} />
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CanopySettingsDialog;
