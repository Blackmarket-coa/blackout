import { useCallback, useState, type CSSProperties } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { myProfileAtom } from '../profile/profileAtoms';
import { ProfileEditor } from '../profile/ProfileEditor';
import { postWall, saveProfile } from '../profile/profileClient';
import { getPersonalInviteLink } from '../invitations/invitationsClient';
import { homeFeedRefreshAtom } from '../../state/homeFeed';

type Panel = 'none' | 'post' | 'share' | 'edit';
type PostMode = 'status' | 'wall';

const clusterStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const buttonStyle: CSSProperties = {
    appearance: 'none',
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: 'var(--accent-primary, #3b82f6)',
    border: '1px solid var(--accent-primary, #3b82f6)',
};

const panelStyle: CSSProperties = {
    marginTop: 8,
    padding: 12,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: 'min(420px, 90vw)',
};

const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 14,
};

const segmentStyle = (active: boolean): CSSProperties => ({
    ...buttonStyle,
    padding: '4px 10px',
    fontSize: 12,
    background: active ? 'var(--accent-primary, #3b82f6)' : 'transparent',
    borderColor: active ? 'var(--accent-primary, #3b82f6)' : 'var(--border-default, #374151)',
});

const noteStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };

const modalOverlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '5vh 16px',
    overflowY: 'auto',
    zIndex: 1000,
};

const modalCardStyle: CSSProperties = {
    width: 'min(720px, 100%)',
    background: 'var(--bg-surface, #0f172a)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    padding: 16,
};

/**
 * Top-right home-page action cluster: post a status or wall update, edit your
 * full profile, or grab your reusable personal share link. Posting bumps
 * `homeFeedRefreshAtom` so the new update shows up in the feed below.
 */
export const HomeComposer = (): JSX.Element => {
    const [profile, setProfile] = useAtom(myProfileAtom);
    const bumpFeed = useSetAtom(homeFeedRefreshAtom);

    const [panel, setPanel] = useState<Panel>('none');
    const [postMode, setPostMode] = useState<PostMode>('status');
    const [text, setText] = useState('');
    const [emoji, setEmoji] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);

    const togglePanel = (next: Panel) => {
        setFeedback(null);
        setPanel((cur) => (cur === next ? 'none' : next));
    };

    const submitPost = useCallback(async () => {
        const body = text.trim();
        if (!body) return;
        setBusy(true);
        setFeedback(null);
        try {
            if (postMode === 'status') {
                const status = { text: body, ...(emoji.trim() ? { emoji: emoji.trim() } : {}) };
                const nextProfile = { ...profile.profile, status };
                await saveProfile(profile.userId, { profile: nextProfile });
                setProfile({ ...profile, profile: nextProfile });
            } else {
                await postWall(profile.userId, body);
            }
            setText('');
            setEmoji('');
            setFeedback('Posted.');
            bumpFeed((n) => n + 1);
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : 'Could not post.');
        } finally {
            setBusy(false);
        }
    }, [text, emoji, postMode, profile, saveProfile, setProfile, bumpFeed]);

    const loadShareLink = useCallback(async () => {
        setBusy(true);
        setFeedback(null);
        try {
            const res = await getPersonalInviteLink();
            setShareUrl(res.shareUrl);
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : 'Could not load your link.');
        } finally {
            setBusy(false);
        }
    }, []);

    const shareOrCopy = useCallback(async () => {
        if (!shareUrl) return;
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title: 'Join me on Blackout', url: shareUrl });
                return;
            }
        } catch {
            /* user dismissed the share sheet — fall through to copy */
        }
        try {
            await navigator.clipboard?.writeText(shareUrl);
            setFeedback('Link copied.');
        } catch {
            setFeedback('Copy this link manually.');
        }
    }, [shareUrl]);

    const openShare = () => {
        togglePanel('share');
        if (!shareUrl) void loadShareLink();
    };

    return (
        <div data-testid="home-composer">
            <div style={clusterStyle}>
                <button
                    type="button"
                    style={panel === 'post' ? primaryButtonStyle : buttonStyle}
                    data-testid="home-composer-post-toggle"
                    onClick={() => togglePanel('post')}
                >
                    Post
                </button>
                <button
                    type="button"
                    style={buttonStyle}
                    data-testid="home-composer-edit-toggle"
                    onClick={() => togglePanel('edit')}
                >
                    Edit profile
                </button>
                <button
                    type="button"
                    style={buttonStyle}
                    data-testid="home-composer-share-toggle"
                    onClick={openShare}
                >
                    Share link
                </button>
            </div>

            {panel === 'post' ? (
                <div style={panelStyle} data-testid="home-composer-post-panel">
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            type="button"
                            style={segmentStyle(postMode === 'status')}
                            onClick={() => setPostMode('status')}
                        >
                            Status
                        </button>
                        <button
                            type="button"
                            style={segmentStyle(postMode === 'wall')}
                            onClick={() => setPostMode('wall')}
                        >
                            Wall post
                        </button>
                    </div>
                    {postMode === 'status' ? (
                        <input
                            type="text"
                            aria-label="Status emoji"
                            placeholder="Emoji (optional)"
                            value={emoji}
                            maxLength={8}
                            onChange={(e) => setEmoji(e.target.value)}
                            style={{ ...inputStyle, width: 120 }}
                        />
                    ) : null}
                    <textarea
                        aria-label={postMode === 'status' ? 'Status text' : 'Wall post'}
                        placeholder={
                            postMode === 'status' ? "What's your status?" : 'Share an update…'
                        }
                        value={text}
                        maxLength={postMode === 'status' ? 140 : 2000}
                        onChange={(e) => setText(e.target.value)}
                        rows={postMode === 'status' ? 2 : 4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <span style={noteStyle}>{feedback}</span>
                        <button
                            type="button"
                            style={primaryButtonStyle}
                            disabled={busy || text.trim().length === 0}
                            data-testid="home-composer-submit"
                            onClick={() => void submitPost()}
                        >
                            {busy ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            ) : null}

            {panel === 'share' ? (
                <div style={panelStyle} data-testid="home-composer-share-panel">
                    <span style={noteStyle}>
                        Your reusable link — paste it in your TikTok or Instagram bio. Anyone who
                        signs up through it follows you.
                    </span>
                    <input
                        type="text"
                        readOnly
                        aria-label="Personal share link"
                        value={shareUrl ?? (busy ? 'Loading…' : '')}
                        style={inputStyle}
                        onFocus={(e) => e.currentTarget.select()}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <span style={noteStyle}>{feedback}</span>
                        <button
                            type="button"
                            style={primaryButtonStyle}
                            disabled={!shareUrl}
                            data-testid="home-composer-share-copy"
                            onClick={() => void shareOrCopy()}
                        >
                            Share / copy
                        </button>
                    </div>
                </div>
            ) : null}

            {panel === 'edit' ? (
                <div
                    style={modalOverlayStyle}
                    role="dialog"
                    aria-modal="true"
                    data-testid="home-composer-edit-modal"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setPanel('none');
                    }}
                >
                    <div style={modalCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                style={buttonStyle}
                                onClick={() => setPanel('none')}
                            >
                                Close
                            </button>
                        </div>
                        <ProfileEditor />
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default HomeComposer;
