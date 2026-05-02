import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import AvatarDecoration from './AvatarDecoration';
import ProfileThemeEditor from './ProfileThemeEditor';
import { availableDecorations, myProfileAtom } from './profileAtoms';
import type {
    ConnectionType,
    ProfileConnection,
    ProfileCustomTheme,
    ProfilePinnedMedia,
    ProfileStatus,
    ProfileTopFriends,
    ProfileWallModeration,
    ProfileWallSettings,
    ProfileWallVisibility,
    ProfileWallWhoCanPost,
} from './profileTypes';

const fileToObjectUrl = (file: File): string => URL.createObjectURL(file);

const defaultConnection = (): ProfileConnection => ({ type: 'website', label: '', url: '' });

function nextStatus(
    current: ProfileStatus | undefined,
    patch: Partial<ProfileStatus>,
): ProfileStatus | undefined {
    const merged: ProfileStatus = {
        text: current?.text ?? '',
        emoji: current?.emoji,
        expiresAt: current?.expiresAt,
        ...patch,
    };
    if (!merged.text || merged.text.trim().length === 0) return undefined;
    return merged;
}

function nextWall(
    current: ProfileWallSettings | undefined,
    patch: Partial<ProfileWallSettings>,
): ProfileWallSettings {
    return {
        visibility: current?.visibility ?? 'public',
        whoCanPost: current?.whoCanPost ?? 'friends',
        moderation: current?.moderation ?? 'open',
        ...patch,
    };
}

const MATRIX_USER_ID_RE = /^@[^:\s]+:[^:\s]+$/;

function nextTopFriends(rawText: string): ProfileTopFriends | undefined {
    const ids = rawText
        .split(/[\n,]+/)
        .map((id) => id.trim())
        .filter((id) => MATRIX_USER_ID_RE.test(id));
    const deduped: string[] = [];
    for (const id of ids) {
        if (!deduped.includes(id)) deduped.push(id);
        if (deduped.length >= 12) break;
    }
    return deduped.length > 0 ? { userIds: deduped } : undefined;
}

export const ProfileEditor = () => {
    const [profile, setProfile] = useAtom(myProfileAtom);
    const [nextConnection, setNextConnection] = useState<ProfileConnection>(defaultConnection());
    const [bannerCrop, setBannerCrop] = useState(50);
    const [avatarCrop, setAvatarCrop] = useState(50);

    const bioLength = useMemo(() => profile.profile.bio?.length ?? 0, [profile.profile.bio]);

    const onImageUpload = (field: 'banner' | 'avatarUrl', file?: File) => {
        if (!file) return;
        const objectUrl = fileToObjectUrl(file);
        setProfile((prev) =>
            field === 'banner'
                ? { ...prev, profile: { ...prev.profile, banner: objectUrl } }
                : { ...prev, avatarUrl: objectUrl },
        );
    };

    const updateConnection = (idx: number, patch: Partial<ProfileConnection>) => {
        setProfile((prev) => ({
            ...prev,
            profile: {
                ...prev.profile,
                connections: (prev.profile.connections ?? []).map((entry, entryIdx) =>
                    entryIdx === idx ? { ...entry, ...patch } : entry,
                ),
            },
        }));
    };

    const addConnection = () => {
        if (!nextConnection.url.trim()) return;
        setProfile((prev) => ({
            ...prev,
            profile: {
                ...prev.profile,
                connections: [...(prev.profile.connections ?? []), nextConnection],
            },
        }));
        setNextConnection(defaultConnection());
    };

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <h3 style={{ margin: 0 }}>Edit Profile</h3>

            <section>
                <h4>Banner upload with crop</h4>
                {profile.profile.banner ? (
                    <div
                        style={{
                            borderRadius: 10,
                            overflow: 'hidden',
                            height: 120,
                            border: '1px solid var(--border-default)',
                        }}
                    >
                        <img
                            src={profile.profile.banner}
                            alt="Banner preview"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: `center ${bannerCrop}%`,
                            }}
                        />
                    </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => onImageUpload('banner', event.target.files?.[0])}
                    />
                    <label>
                        Crop
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={bannerCrop}
                            onChange={(event) => setBannerCrop(Number(event.target.value))}
                        />
                    </label>
                </div>
            </section>

            <section>
                <h4>Avatar upload with crop</h4>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <AvatarDecoration
                        avatarUrl={profile.avatarUrl}
                        displayName={profile.displayName}
                        decorationId={profile.profile.decoration}
                        size={88}
                    />
                    <div>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                                onImageUpload('avatarUrl', event.target.files?.[0])
                            }
                        />
                        <label style={{ display: 'block', marginTop: 6 }}>
                            Crop
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={avatarCrop}
                                onChange={(event) => setAvatarCrop(Number(event.target.value))}
                            />
                        </label>
                    </div>
                </div>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
                <label>
                    Display name
                    <input
                        value={profile.displayName}
                        onChange={(event) =>
                            setProfile((prev) => ({ ...prev, displayName: event.target.value }))
                        }
                        style={{ display: 'block', width: '100%' }}
                    />
                </label>
                <label>
                    Pronouns
                    <input
                        value={profile.profile.pronouns ?? ''}
                        onChange={(event) =>
                            setProfile((prev) => ({
                                ...prev,
                                profile: {
                                    ...prev.profile,
                                    pronouns: event.target.value.slice(0, 60),
                                },
                            }))
                        }
                        style={{ display: 'block', width: '100%' }}
                    />
                </label>
            </section>

            <section>
                <h4>Bio editor (Markdown, max 2000 chars)</h4>
                <textarea
                    value={profile.profile.bio ?? ''}
                    maxLength={2000}
                    rows={6}
                    onChange={(event) =>
                        setProfile((prev) => ({
                            ...prev,
                            profile: { ...prev.profile, bio: event.target.value },
                        }))
                    }
                    style={{ width: '100%' }}
                />
                <small>{bioLength}/2000</small>
            </section>

            <section>
                <h4>Connection manager</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                    {(profile.profile.connections ?? []).map((connection, idx) => (
                        <div
                            key={`${connection.url}-${idx}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '120px 1fr 1fr auto',
                                gap: 8,
                            }}
                        >
                            <select
                                value={connection.type}
                                onChange={(event) =>
                                    updateConnection(idx, {
                                        type: event.target.value as ConnectionType,
                                    })
                                }
                            >
                                <option value="github">GitHub</option>
                                <option value="website">Website</option>
                                <option value="linkedin">LinkedIn</option>
                                <option value="x">X</option>
                                <option value="matrix">Matrix</option>
                                <option value="other">Other</option>
                            </select>
                            <input
                                placeholder="Label/username"
                                value={connection.label ?? connection.username ?? ''}
                                onChange={(event) =>
                                    updateConnection(idx, {
                                        label: event.target.value,
                                        username: event.target.value,
                                    })
                                }
                            />
                            <input
                                placeholder="https://..."
                                value={connection.url}
                                onChange={(event) =>
                                    updateConnection(idx, { url: event.target.value })
                                }
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setProfile((prev) => ({
                                        ...prev,
                                        profile: {
                                            ...prev.profile,
                                            connections: (prev.profile.connections ?? []).filter(
                                                (_, entryIdx) => entryIdx !== idx,
                                            ),
                                        },
                                    }))
                                }
                            >
                                Remove
                            </button>
                        </div>
                    ))}

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '120px 1fr 1fr auto',
                            gap: 8,
                        }}
                    >
                        <select
                            value={nextConnection.type}
                            onChange={(event) =>
                                setNextConnection((prev) => ({
                                    ...prev,
                                    type: event.target.value as ConnectionType,
                                }))
                            }
                        >
                            <option value="github">GitHub</option>
                            <option value="website">Website</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="x">X</option>
                            <option value="matrix">Matrix</option>
                            <option value="other">Other</option>
                        </select>
                        <input
                            placeholder="Label/username"
                            value={nextConnection.label ?? ''}
                            onChange={(event) =>
                                setNextConnection((prev) => ({
                                    ...prev,
                                    label: event.target.value,
                                    username: event.target.value,
                                }))
                            }
                        />
                        <input
                            placeholder="https://..."
                            value={nextConnection.url}
                            onChange={(event) =>
                                setNextConnection((prev) => ({ ...prev, url: event.target.value }))
                            }
                        />
                        <button type="button" onClick={addConnection}>
                            Add
                        </button>
                    </div>
                </div>
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Status</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 200px', gap: 8 }}>
                    <input
                        placeholder="🌱"
                        value={profile.profile.status?.emoji ?? ''}
                        onChange={(event) =>
                            setProfile((prev) => ({
                                ...prev,
                                profile: {
                                    ...prev.profile,
                                    status: nextStatus(prev.profile.status, {
                                        emoji: event.target.value,
                                    }),
                                },
                            }))
                        }
                    />
                    <input
                        placeholder="What's on your mind?"
                        maxLength={140}
                        value={profile.profile.status?.text ?? ''}
                        onChange={(event) =>
                            setProfile((prev) => ({
                                ...prev,
                                profile: {
                                    ...prev.profile,
                                    status: nextStatus(prev.profile.status, {
                                        text: event.target.value,
                                    }),
                                },
                            }))
                        }
                    />
                    <input
                        type="datetime-local"
                        value={profile.profile.status?.expiresAt?.slice(0, 16) ?? ''}
                        onChange={(event) =>
                            setProfile((prev) => ({
                                ...prev,
                                profile: {
                                    ...prev.profile,
                                    status: nextStatus(prev.profile.status, {
                                        expiresAt: event.target.value
                                            ? new Date(event.target.value).toISOString()
                                            : undefined,
                                    }),
                                },
                            }))
                        }
                    />
                </div>
                {profile.profile.status?.text ? (
                    <button
                        type="button"
                        onClick={() =>
                            setProfile((prev) => ({
                                ...prev,
                                profile: { ...prev.profile, status: undefined },
                            }))
                        }
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Clear status
                    </button>
                ) : null}
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Wall settings</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <label>
                        Visibility
                        <select
                            value={profile.profile.wall?.visibility ?? 'public'}
                            onChange={(event) =>
                                setProfile((prev) => ({
                                    ...prev,
                                    profile: {
                                        ...prev.profile,
                                        wall: nextWall(prev.profile.wall, {
                                            visibility: event.target.value as ProfileWallVisibility,
                                        }),
                                    },
                                }))
                            }
                            style={{ display: 'block', width: '100%' }}
                        >
                            <option value="public">Public</option>
                            <option value="friends">Friends</option>
                            <option value="private">Private</option>
                        </select>
                    </label>
                    <label>
                        Who can post
                        <select
                            value={profile.profile.wall?.whoCanPost ?? 'friends'}
                            onChange={(event) =>
                                setProfile((prev) => ({
                                    ...prev,
                                    profile: {
                                        ...prev.profile,
                                        wall: nextWall(prev.profile.wall, {
                                            whoCanPost: event.target.value as ProfileWallWhoCanPost,
                                        }),
                                    },
                                }))
                            }
                            style={{ display: 'block', width: '100%' }}
                        >
                            <option value="owner">Only me</option>
                            <option value="friends">Friends</option>
                            <option value="anyone">Anyone</option>
                        </select>
                    </label>
                    <label>
                        Moderation
                        <select
                            value={profile.profile.wall?.moderation ?? 'open'}
                            onChange={(event) =>
                                setProfile((prev) => ({
                                    ...prev,
                                    profile: {
                                        ...prev.profile,
                                        wall: nextWall(prev.profile.wall, {
                                            moderation: event.target.value as ProfileWallModeration,
                                        }),
                                    },
                                }))
                            }
                            style={{ display: 'block', width: '100%' }}
                        >
                            <option value="open">Open</option>
                            <option value="approval">Require approval</option>
                        </select>
                    </label>
                </div>
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Top friends (max 12)</h4>
                <textarea
                    rows={3}
                    placeholder="@friend:server, one per line or comma-separated"
                    value={(profile.profile.topFriends?.userIds ?? []).join('\n')}
                    onChange={(event) =>
                        setProfile((prev) => ({
                            ...prev,
                            profile: {
                                ...prev.profile,
                                topFriends: nextTopFriends(event.target.value),
                            },
                        }))
                    }
                    style={{ width: '100%' }}
                />
                <small>{profile.profile.topFriends?.userIds.length ?? 0} of 12</small>
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Profile theme</h4>
                <ProfileThemeEditor
                    theme={profile.profile.customTheme}
                    onChange={(next) =>
                        setProfile((prev) => ({
                            ...prev,
                            profile: { ...prev.profile, customTheme: next },
                        }))
                    }
                />
            </section>

            <section>
                <h4>Decoration selector</h4>
                <div
                    style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    }}
                >
                    {availableDecorations.map((option) => {
                        const selected = (profile.profile.decoration ?? 'none') === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                    setProfile((prev) => ({
                                        ...prev,
                                        profile: {
                                            ...prev.profile,
                                            decoration:
                                                option.id === 'none' ? undefined : option.id,
                                        },
                                    }))
                                }
                                style={{
                                    border: selected
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    padding: 8,
                                    textAlign: 'left',
                                }}
                            >
                                <div
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: '50%',
                                        background: option.cssGradient,
                                        marginBottom: 6,
                                    }}
                                />
                                <strong>{option.label}</strong>
                                {option.gated ? (
                                    <small style={{ display: 'block', opacity: 0.8 }}>
                                        Cosmetic unlock
                                    </small>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default ProfileEditor;
