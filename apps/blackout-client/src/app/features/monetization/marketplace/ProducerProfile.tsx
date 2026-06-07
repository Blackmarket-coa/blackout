import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    fetchProducerProfile,
    updateMyProducerProfile,
    type ProducerProfile as ProducerProfileRecord,
} from './marketplaceClient';
import { readBlackoutApiToken } from './useMarketplaceAuth';
import { decodeBlackoutUserId } from '../../streams/channelPointsClient';

interface ProducerProfileProps {
    /** The producer to display. Defaults to the signed-in user. */
    userId?: string;
    /** When true (and viewing your own profile) render the inline editor. */
    editable?: boolean;
}

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };

const avatarStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    objectFit: 'cover',
    background: 'var(--bg-muted, #1e293b)',
    flexShrink: 0,
};

const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };
const inputStyle: CSSProperties = {
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-base, #0b1120)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
};
const buttonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

/**
 * Display-only read-view of a marketplace producer/seller profile (name, bio,
 * avatar, reputation tier, vacation badge), with an optional inline self-editor
 * when viewing your own profile. Profile data is read from
 * /v1/marketplace/sellers/:userId/profile; payout routing never reaches here.
 */
export function ProducerProfile({ userId, editable = false }: ProducerProfileProps): JSX.Element | null {
    const myId = decodeBlackoutUserId();
    const targetId = userId ?? myId;
    const isOwn = !!targetId && targetId === myId;

    const [profile, setProfile] = useState<ProducerProfileRecord | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ displayName: '', bio: '', avatarUrl: '', vacationMode: false });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!targetId) {
            setLoaded(true);
            return;
        }
        let cancelled = false;
        fetchProducerProfile(targetId, readBlackoutApiToken())
            .then((result) => {
                if (cancelled) return;
                setProfile(result);
                if (result) {
                    setDraft({
                        displayName: result.displayName ?? '',
                        bio: result.bio ?? '',
                        avatarUrl: result.avatarUrl ?? '',
                        vacationMode: result.vacationMode,
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [targetId]);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await updateMyProducerProfile(
                {
                    displayName: draft.displayName.trim() || null,
                    bio: draft.bio.trim() || null,
                    avatarUrl: draft.avatarUrl.trim() || null,
                    vacationMode: draft.vacationMode,
                },
                readBlackoutApiToken()
            );
            setProfile(updated);
            setEditing(false);
        } catch {
            setError('Could not save profile');
        } finally {
            setSaving(false);
        }
    }, [draft]);

    if (!targetId) return null;
    if (!loaded) return null;

    const canEdit = editable && isOwn;

    if (editing && canEdit) {
        return (
            <section style={cardStyle} data-testid="producer-profile-editor">
                <label style={labelStyle}>
                    Display name
                    <input
                        style={inputStyle}
                        value={draft.displayName}
                        onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                        maxLength={120}
                    />
                </label>
                <label style={labelStyle}>
                    Bio
                    <textarea
                        style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
                        value={draft.bio}
                        onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                        maxLength={2000}
                    />
                </label>
                <label style={labelStyle}>
                    Avatar URL
                    <input
                        style={inputStyle}
                        value={draft.avatarUrl}
                        onChange={(e) => setDraft((d) => ({ ...d, avatarUrl: e.target.value }))}
                        maxLength={2048}
                    />
                </label>
                <label style={{ ...labelStyle, flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={draft.vacationMode}
                        onChange={(e) => setDraft((d) => ({ ...d, vacationMode: e.target.checked }))}
                    />
                    Vacation mode (pause new orders)
                </label>
                {error ? <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 12 }}>{error}</span> : null}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" style={buttonStyle} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        type="button"
                        style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-muted, #9ca3af)' }}
                        onClick={() => setEditing(false)}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                </div>
            </section>
        );
    }

    if (!profile) {
        if (!canEdit) return null;
        return (
            <section style={cardStyle} data-testid="producer-profile-empty">
                <span style={labelStyle}>You don’t have a producer profile yet.</span>
                <button type="button" style={buttonStyle} onClick={() => setEditing(true)}>
                    Create producer profile
                </button>
            </section>
        );
    }

    return (
        <section style={cardStyle} data-testid="producer-profile">
            <div style={headerStyle}>
                {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" style={avatarStyle} />
                ) : (
                    <div style={avatarStyle} aria-hidden />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                        {profile.displayName ?? 'Unnamed producer'}
                    </span>
                    <span style={labelStyle}>
                        {profile.reputationTier ? `${profile.reputationTier} · ` : ''}
                        {profile.vacationMode ? 'On vacation' : 'Open for orders'}
                    </span>
                </div>
            </div>
            {profile.bio ? <p style={{ margin: 0, fontSize: 13 }}>{profile.bio}</p> : null}
            {canEdit ? (
                <button
                    type="button"
                    style={{ ...buttonStyle, alignSelf: 'flex-start', background: 'transparent', color: 'var(--accent-primary, #3b82f6)' }}
                    onClick={() => setEditing(true)}
                >
                    Edit profile
                </button>
            ) : null}
        </section>
    );
}

export default ProducerProfile;
