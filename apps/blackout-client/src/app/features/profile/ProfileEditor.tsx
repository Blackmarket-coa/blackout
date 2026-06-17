import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import AvatarDecoration from './AvatarDecoration';
import ProfileThemeEditor from './ProfileThemeEditor';
import { myProfileAtom } from './profileAtoms';
import { profileDisplayLabel } from './profileDisplay';
import {
    avatarDecorationCatalogAtom,
    badgeCatalogAtom,
    nameplateCatalogAtom,
    profileEffectCatalogAtom,
} from './cosmeticsAtoms';
import { saveProfile as saveProfileDefault, type SaveProfileInput } from './profileClient';
import { syncStatusToPresence } from './customStatus';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useHardenAvatarImage } from '../privacy-tools/useHardenAvatarImage';
import { MEMBER_PRIMARY_ROLES } from './profileTypes';
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
    patch: Partial<ProfileStatus>
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
    patch: Partial<ProfileWallSettings>
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

export interface ProfileEditorProps {
    saveProfile?: (userId: string, input: SaveProfileInput) => Promise<unknown>;
}

export const ProfileEditor = ({ saveProfile = saveProfileDefault }: ProfileEditorProps = {}) => {
    const mx = useMatrixClient();
    const [profile, setProfile] = useAtom(myProfileAtom);
    const decorationCatalog = useAtomValue(avatarDecorationCatalogAtom);
    const nameplateCatalog = useAtomValue(nameplateCatalogAtom);
    const profileEffectCatalog = useAtomValue(profileEffectCatalogAtom);
    const badgeCatalog = useAtomValue(badgeCatalogAtom);
    const [nextConnection, setNextConnection] = useState<ProfileConnection>(defaultConnection());
    const [bannerCrop, setBannerCrop] = useState(50);
    const [avatarCrop, setAvatarCrop] = useState(50);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const hardenImage = useHardenAvatarImage();

    const bioLength = useMemo(() => profile.profile.bio?.length ?? 0, [profile.profile.bio]);

    // The self-profile atom ships with a placeholder identity
    // (`userId: '@you:example.org'`). The API rejects (403) any profile PUT whose
    // path userId doesn't match the authenticated subject, so an un-reconciled
    // profile can never be saved. Pull the signed-in Matrix id and adopt it as
    // the profile's identity before the user reaches "Save".
    const authenticatedUserId = mx.getUserId();
    useEffect(() => {
        if (!authenticatedUserId) return;
        if (profile.userId === authenticatedUserId) return;
        setProfile((prev) =>
            prev.userId === authenticatedUserId ? prev : { ...prev, userId: authenticatedUserId }
        );
    }, [authenticatedUserId, profile.userId, setProfile]);

    const onSave = useCallback(async () => {
        setSaveState('saving');
        setSaveError(null);
        // Save against the authenticated id (falling back to the stored id when the
        // Matrix client can't supply one) so the request targets the caller's own
        // profile rather than the seeded placeholder.
        const targetUserId = authenticatedUserId ?? profile.userId;
        try {
            await saveProfile(targetUserId, {
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                primaryRole: profile.primaryRole,
                roleBadges: profile.roleBadges,
                mutualSpaces: profile.mutualSpaces,
                isFriend: profile.isFriend,
                profile: profile.profile,
            });
            // Publish the status to presence so other clients can see it.
            await syncStatusToPresence(mx, profile.profile.status);
            setSaveState('saved');
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save profile.');
            setSaveState('error');
        }
    }, [authenticatedUserId, mx, profile, saveProfile]);

    const onImageUpload = async (field: 'banner' | 'avatarUrl', file?: File) => {
        if (!file) return;
        // Avatars carry faces — harden them (EXIF strip + optional perturbation)
        // before they become the preview/upload source.
        const prepared = field === 'avatarUrl' ? await hardenImage(file) : file;
        const objectUrl = fileToObjectUrl(prepared);
        setProfile((prev) =>
            field === 'banner'
                ? { ...prev, profile: { ...prev.profile, banner: objectUrl } }
                : { ...prev, avatarUrl: objectUrl }
        );
    };

    const updateConnection = (idx: number, patch: Partial<ProfileConnection>) => {
        setProfile((prev) => ({
            ...prev,
            profile: {
                ...prev.profile,
                connections: (prev.profile.connections ?? []).map((entry, entryIdx) =>
                    entryIdx === idx ? { ...entry, ...patch } : entry
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
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                }}
            >
                <h3 style={{ margin: 0 }}>Edit Profile</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saveState === 'saved' ? (
                        <span
                            data-testid="profile-editor-save-confirm"
                            style={{ fontSize: 12, color: 'var(--success, #2ECC71)' }}
                        >
                            Saved
                        </span>
                    ) : null}
                    <button
                        type="button"
                        data-testid="profile-editor-save"
                        onClick={() => void onSave()}
                        disabled={saveState === 'saving'}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--accent-primary, #1ABC9C)',
                            background: 'var(--accent-primary, #1ABC9C)',
                            color: '#fff',
                            cursor: saveState === 'saving' ? 'progress' : 'pointer',
                        }}
                    >
                        {saveState === 'saving' ? 'Saving…' : 'Save profile'}
                    </button>
                </div>
            </header>
            {saveError ? (
                <p
                    role="alert"
                    data-testid="profile-editor-save-error"
                    style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}
                >
                    {saveError}
                </p>
            ) : null}

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
                        displayName={profileDisplayLabel(profile)}
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
                <label>
                    Primary role
                    <select
                        data-testid="profile-editor-primary-role"
                        value={profile.primaryRole ?? ''}
                        onChange={(event) =>
                            setProfile((prev) => ({
                                ...prev,
                                primaryRole: event.target.value || undefined,
                            }))
                        }
                        style={{ display: 'block', width: '100%' }}
                    >
                        <option value="">No primary role</option>
                        {MEMBER_PRIMARY_ROLES.map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                        {profile.primaryRole &&
                        !MEMBER_PRIMARY_ROLES.includes(
                            profile.primaryRole as typeof MEMBER_PRIMARY_ROLES[number]
                        ) ? (
                            <option value={profile.primaryRole}>{profile.primaryRole}</option>
                        ) : null}
                    </select>
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
                                                (_, entryIdx) => entryIdx !== idx
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
                    {decorationCatalog.map((option) => {
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

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Nameplate</h4>
                <select
                    data-testid="profile-editor-nameplate"
                    value={profile.profile.nameplateId ?? 'nameplate-default'}
                    onChange={(event) =>
                        setProfile((prev) => ({
                            ...prev,
                            profile: {
                                ...prev.profile,
                                nameplateId:
                                    event.target.value === 'nameplate-default'
                                        ? undefined
                                        : event.target.value,
                            },
                        }))
                    }
                    style={{ width: '100%' }}
                >
                    {nameplateCatalog.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Profile effect</h4>
                <select
                    data-testid="profile-editor-effect"
                    value={profile.profile.profileEffectId ?? 'effect-none'}
                    onChange={(event) =>
                        setProfile((prev) => ({
                            ...prev,
                            profile: {
                                ...prev.profile,
                                profileEffectId:
                                    event.target.value === 'effect-none'
                                        ? undefined
                                        : event.target.value,
                            },
                        }))
                    }
                    style={{ width: '100%' }}
                >
                    {profileEffectCatalog.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Badges (max 6)</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {badgeCatalog.map((badge) => {
                        const equipped = (profile.profile.badgeIds ?? []).includes(badge.id);
                        return (
                            <button
                                key={badge.id}
                                type="button"
                                onClick={() =>
                                    setProfile((prev) => {
                                        const current = prev.profile.badgeIds ?? [];
                                        const next = current.includes(badge.id)
                                            ? current.filter((id) => id !== badge.id)
                                            : [...current, badge.id].slice(0, 6);
                                        return {
                                            ...prev,
                                            profile: {
                                                ...prev.profile,
                                                badgeIds: next.length > 0 ? next : undefined,
                                            },
                                        };
                                    })
                                }
                                style={{
                                    border: equipped
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '4px 10px',
                                    cursor: 'pointer',
                                }}
                            >
                                <span aria-hidden style={{ marginRight: 4 }}>
                                    {badge.glyph ?? '★'}
                                </span>
                                {badge.label}
                            </button>
                        );
                    })}
                    {badgeCatalog.length === 0 ? (
                        <small style={{ opacity: 0.8 }}>No badges owned yet.</small>
                    ) : null}
                </div>
            </section>
        </div>
    );
};

export default ProfileEditor;
