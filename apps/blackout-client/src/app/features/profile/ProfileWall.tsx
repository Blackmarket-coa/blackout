import React, { useState, type CSSProperties, type FormEvent } from 'react';
import { atom, useAtom } from 'jotai';
import type { ProfileWallSettings } from './profileTypes';

export interface WallPost {
    id: string;
    profileId: string;
    authorId: string;
    body: string;
    createdAt: string;
}

/**
 * Local-only wall draft store. Production wiring will replace this with a
 * `co.bmc.profile.wall` Matrix room (see plan: forum event shape gives us
 * federation, threading, and reactions for free). Today's component is shape
 * complete so the rest of the profile UI can compose against it.
 */
const wallPostsAtom = atom<Record<string, WallPost[]>>({});

export interface ProfileWallProps {
    profileId: string;
    /** Wall settings as read from co.bmc.profile.wall on the profile event. */
    settings?: ProfileWallSettings;
    /** Current viewer's Matrix user id. Used to gate posting. */
    viewerId?: string;
    /** Whether the viewer is in the profile owner's friends graph. */
    viewerIsFriend?: boolean;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const postStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};

const composerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-input)',
};

const textareaStyle: CSSProperties = {
    width: '100%',
    minHeight: 64,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    resize: 'vertical',
};

function newPostId(): string {
    return `wall_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Decide whether a viewer can post on this wall given the wall's whoCanPost
 * setting, the viewer id, and (for the 'friends' setting) whether the viewer
 * is in the profile owner's friends graph.
 */
export function canPostOnWall(
    settings: ProfileWallSettings | undefined,
    profileOwnerId: string,
    viewerId: string | undefined,
    viewerIsFriend: boolean,
): boolean {
    if (!viewerId) return false;
    const whoCanPost = settings?.whoCanPost ?? 'friends';
    if (whoCanPost === 'anyone') return true;
    if (whoCanPost === 'owner') return viewerId === profileOwnerId;
    return viewerId === profileOwnerId || viewerIsFriend;
}

/**
 * Decide whether a viewer can read this wall given the wall's visibility.
 */
export function canViewWall(
    settings: ProfileWallSettings | undefined,
    profileOwnerId: string,
    viewerId: string | undefined,
    viewerIsFriend: boolean,
): boolean {
    const visibility = settings?.visibility ?? 'public';
    if (visibility === 'public') return true;
    if (!viewerId) return false;
    if (viewerId === profileOwnerId) return true;
    if (visibility === 'friends') return viewerIsFriend;
    return false;
}

export function ProfileWall({
    profileId,
    settings,
    viewerId,
    viewerIsFriend = false,
}: ProfileWallProps) {
    const [postsByProfile, setPostsByProfile] = useAtom(wallPostsAtom);
    const [draft, setDraft] = useState('');

    const posts = postsByProfile[profileId] ?? [];
    const canRead = canViewWall(settings, profileId, viewerId, viewerIsFriend);
    const canPost = canPostOnWall(settings, profileId, viewerId, viewerIsFriend);

    if (!canRead) {
        return (
            <div style={{ padding: 16, color: 'var(--text-secondary)' }}>
                This wall is{' '}
                <strong>{settings?.visibility === 'private' ? 'private' : 'friends-only'}</strong>.
            </div>
        );
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!viewerId) return;
        const body = draft.trim();
        if (body.length === 0) return;
        const post: WallPost = {
            id: newPostId(),
            profileId,
            authorId: viewerId,
            body: body.slice(0, 4000),
            createdAt: new Date().toISOString(),
        };
        setPostsByProfile((prev) => ({
            ...prev,
            [profileId]: [post, ...(prev[profileId] ?? [])],
        }));
        setDraft('');
    };

    return (
        <div style={containerStyle} data-testid="profile-wall">
            {canPost ? (
                <form style={composerStyle} onSubmit={handleSubmit}>
                    <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={
                            settings?.moderation === 'approval'
                                ? 'Leave a comment (will appear after approval)…'
                                : 'Leave a comment…'
                        }
                        style={textareaStyle}
                        maxLength={4000}
                    />
                    <button
                        type="submit"
                        disabled={draft.trim().length === 0}
                        style={{
                            alignSelf: 'flex-end',
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: 'none',
                            background: 'var(--accent-primary, #1ABC9C)',
                            color: '#0d1f14',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Post
                    </button>
                </form>
            ) : (
                <div style={{ padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Posting is limited to{' '}
                    <strong>{settings?.whoCanPost ?? 'friends'}</strong>.
                </div>
            )}

            {posts.length === 0 ? (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                    No comments yet.
                </div>
            ) : (
                posts.map((post) => (
                    <article key={post.id} style={postStyle}>
                        <header
                            style={{
                                display: 'flex',
                                gap: 8,
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <strong style={{ color: 'var(--text-primary)' }}>{post.authorId}</strong>
                            <time>{new Date(post.createdAt).toLocaleString()}</time>
                        </header>
                        <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                            {post.body}
                        </p>
                    </article>
                ))
            )}
        </div>
    );
}

export default ProfileWall;
