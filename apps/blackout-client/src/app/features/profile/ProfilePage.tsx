import React, { type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { myProfileAtom } from './profileAtoms';
import { profileDisplayLabel } from './profileDisplay';
import AvatarDecoration from './AvatarDecoration';
import Nameplate from './Nameplate';
import ProfileEffect from './ProfileEffect';
import CosmeticBadges from './CosmeticBadge';
import PinnedMediaShelf from './PinnedMediaShelf';
import ProfileStatusBar from './ProfileStatusBar';
import ProfileThemeScope from './ProfileThemeScope';
import ProfileReputation from './ProfileReputation';
import ProfileRings from './ProfileRings';
import ProfileWall from './ProfileWall';
import TopFriendsGrid from './TopFriendsGrid';
import type { MemberProfile } from './profileTypes';

export interface ProfilePageProps {
    /**
     * Profile to render. Defaults to the viewer's own profile when omitted; in
     * the live app the route handler will resolve the `:userId` param into a
     * MemberProfile and pass it here.
     */
    profile?: MemberProfile;
    /** Current viewer's Matrix user id; used by the wall to gate posting. */
    viewerId?: string;
    /** Whether the viewer is in the profile owner's friends graph. */
    viewerIsFriend?: boolean;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    padding: 16,
    maxWidth: 980,
    margin: '0 auto',
    color: 'var(--text-primary)',
};

const bannerStyle: CSSProperties = {
    width: '100%',
    height: 180,
    objectFit: 'cover',
    borderRadius: 12,
    background: 'var(--headerBg, var(--bg-input))',
};

const headerRowStyle: CSSProperties = {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-end',
    marginTop: -56,
    paddingLeft: 16,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface, var(--panelBg))',
};

const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-secondary)',
};

const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
    gap: 16,
    alignItems: 'flex-start',
};

const responsiveGridStyle: CSSProperties = {
    ...gridStyle,
    // The browser collapses to one column under 720px via parent constraints;
    // the grid template above stays simple to keep this component self-contained.
};

export function ProfilePage({ profile, viewerId, viewerIsFriend = false }: ProfilePageProps) {
    const ownProfile = useAtomValue(myProfileAtom);
    const target = profile ?? ownProfile;
    const { profile: profileEvent } = target;
    const displayLabel = profileDisplayLabel(target);

    return (
        <ProfileThemeScope profileId={target.userId} theme={profileEvent.customTheme}>
            <div style={containerStyle} data-testid="profile-page">
                {profileEvent.banner ? (
                    <img src={profileEvent.banner} alt="Profile banner" style={bannerStyle} />
                ) : (
                    <div style={bannerStyle} aria-hidden />
                )}

                <div style={headerRowStyle}>
                    <div style={{ position: 'relative', width: 112, height: 112 }}>
                        <AvatarDecoration
                            avatarUrl={target.avatarUrl}
                            displayName={displayLabel}
                            decorationId={profileEvent.decoration}
                            size={112}
                        />
                        <ProfileEffect profileEffectId={profileEvent.profileEffectId} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <h1 style={{ margin: 0 }}>
                            <Nameplate
                                displayName={displayLabel}
                                nameplateId={profileEvent.nameplateId}
                                fontSize={24}
                            />
                        </h1>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {target.userId}
                            {profileEvent.pronouns ? ` · ${profileEvent.pronouns}` : ''}
                        </div>
                        <CosmeticBadges badgeIds={profileEvent.badgeIds} />
                        <ProfileStatusBar status={profileEvent.status} />
                    </div>
                </div>

                {profileEvent.bio ? (
                    <section style={sectionStyle}>
                        <h2 style={headingStyle}>About</h2>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {profileEvent.bio}
                        </p>
                    </section>
                ) : null}

                <div style={responsiveGridStyle}>
                    <section style={sectionStyle}>
                        <h2 style={headingStyle}>Wall</h2>
                        <ProfileWall
                            profileId={target.userId}
                            settings={profileEvent.wall}
                            viewerId={viewerId}
                            viewerIsFriend={viewerIsFriend}
                        />
                    </section>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <section style={sectionStyle}>
                            <h2 style={headingStyle}>Reputation</h2>
                            <ProfileReputation userId={target.userId} />
                        </section>

                        <section style={sectionStyle}>
                            <h2 style={headingStyle}>Rings</h2>
                            <ProfileRings userId={target.userId} />
                        </section>

                        <section style={sectionStyle}>
                            <h2 style={headingStyle}>Top friends</h2>
                            <TopFriendsGrid topFriends={profileEvent.topFriends} />
                        </section>

                        <section style={sectionStyle}>
                            <h2 style={headingStyle}>Pinned media</h2>
                            <PinnedMediaShelf pinnedMedia={profileEvent.pinnedMedia} />
                        </section>

                        {profileEvent.connections && profileEvent.connections.length > 0 ? (
                            <section style={sectionStyle}>
                                <h2 style={headingStyle}>Connections</h2>
                                <ul
                                    style={{
                                        margin: 0,
                                        paddingLeft: 16,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                    }}
                                >
                                    {profileEvent.connections.map((connection, index) => (
                                        <li key={index} style={{ fontSize: 13 }}>
                                            <a
                                                href={connection.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    color: 'var(--linkColor, var(--accent-primary, #1ABC9C))',
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                {connection.label ??
                                                    connection.username ??
                                                    connection.url}
                                            </a>
                                            <span
                                                style={{
                                                    marginLeft: 6,
                                                    fontSize: 11,
                                                    color: 'var(--text-secondary)',
                                                }}
                                            >
                                                {connection.type}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                    </div>
                </div>
            </div>
        </ProfileThemeScope>
    );
}

export default ProfilePage;
