import type { ReactNode } from 'react';
import { mdToHtml, sanitizeMatrixHtml } from '../../utils/bmc-markdown';
import AvatarDecoration from './AvatarDecoration';
import type { MemberProfile } from './profileTypes';

interface ProfileModalProps {
    open: boolean;
    profile: MemberProfile;
    onClose: () => void;
    onStartDm?: (userId: string) => void;
    onAddFriend?: (userId: string) => void;
    onBlock?: (userId: string) => void;
}

const toSafeHtml = (markdown: string | undefined): string =>
    sanitizeMatrixHtml(mdToHtml(markdown ?? ''));

// Old Discord color palette
const dc = {
    cardBg: '#36393F',
    panelBg: '#2F3136',
    darkBg: '#202225',
    blurple: '#7289DA',
    blurpleHover: '#677BC4',
    textPrimary: '#FFFFFF',
    textSecondary: '#B9BBBE',
    textMuted: '#72767D',
    divider: '#42454A',
    inputBg: '#40444B',
    green: '#43B581',
    danger: '#F04747',
    avatarBorder: '#36393F',
    sectionHeader: {
        color: '#B9BBBE',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        marginBottom: 8,
        marginTop: 0,
    },
};

const roleColors = ['#7289DA', '#43B581', '#FAA61A', '#F04747', '#593695', '#1ABC9C', '#E91E63'];
const getRoleColor = (index: number) => roleColors[index % roleColors.length];

const DcButton = ({
    onClick,
    children,
    variant = 'primary',
}: {
    onClick?: () => void;
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'danger';
}) => {
    const bg = variant === 'primary' ? dc.blurple : variant === 'danger' ? dc.danger : dc.inputBg;
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                background: bg,
                color: dc.textPrimary,
                border: 'none',
                borderRadius: 3,
                padding: '2px 16px',
                height: 32,
                fontFamily: 'Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.17s',
                whiteSpace: 'nowrap',
            }}
        >
            {children}
        </button>
    );
};

export const ProfileModal = ({
    open,
    profile,
    onClose,
    onStartDm,
    onAddFriend,
    onBlock,
}: ProfileModalProps) => {
    if (!open) return null;

    const hasBio = profile.profile.bio && profile.profile.bio.trim().length > 0;
    const hasConnections = (profile.profile.connections ?? []).length > 0;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.7)',
                zIndex: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 480,
                    maxWidth: '96vw',
                    borderRadius: 8,
                    background: dc.cardBg,
                    overflow: 'hidden',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.24), 0 2px 4px rgba(0,0,0,0.18)',
                    fontFamily: 'Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif',
                }}
                onClick={(event) => event.stopPropagation()}
            >
                {/* Banner */}
                <div
                    style={{
                        height: 120,
                        background: profile.profile.banner
                            ? undefined
                            : 'linear-gradient(135deg, #7289DA 0%, #5865F2 100%)',
                        position: 'relative',
                        flexShrink: 0,
                    }}
                >
                    {profile.profile.banner ? (
                        <img
                            src={profile.profile.banner}
                            alt=""
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                            }}
                        />
                    ) : null}

                    {/* Action buttons top-right */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            display: 'flex',
                            gap: 8,
                        }}
                    >
                        {onStartDm && (
                            <DcButton variant="secondary" onClick={() => onStartDm(profile.userId)}>
                                Message
                            </DcButton>
                        )}
                        {onAddFriend && (
                            <DcButton
                                variant={profile.isFriend ? 'secondary' : 'primary'}
                                onClick={() => onAddFriend(profile.userId)}
                            >
                                {profile.isFriend ? 'Friends' : 'Add Friend'}
                            </DcButton>
                        )}
                    </div>
                </div>

                {/* Avatar row */}
                <div
                    style={{ padding: '0 16px', position: 'relative', height: 52, marginBottom: 8 }}
                >
                    <div style={{ position: 'absolute', top: -40, left: 16 }}>
                        <div
                            style={{
                                borderRadius: '50%',
                                background: dc.avatarBorder,
                                padding: 6,
                                display: 'inline-block',
                                lineHeight: 0,
                            }}
                        >
                            <AvatarDecoration
                                avatarUrl={profile.avatarUrl}
                                displayName={profile.displayName}
                                decorationId={profile.profile.decoration}
                                size={80}
                            />
                        </div>

                        {/* Online status dot */}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 6,
                                right: 6,
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: dc.green,
                                border: `3px solid ${dc.cardBg}`,
                            }}
                        />
                    </div>
                </div>

                {/* Body */}
                <div
                    style={{
                        padding: '0 16px 16px',
                        display: 'grid',
                        gap: 0,
                        color: dc.textPrimary,
                    }}
                >
                    {/* Name block */}
                    <div style={{ marginBottom: 12 }}>
                        <h2
                            style={{
                                margin: '0 0 2px',
                                fontSize: 20,
                                fontWeight: 700,
                                color: dc.textPrimary,
                            }}
                        >
                            {profile.displayName}
                        </h2>
                        <div style={{ fontSize: 13, color: dc.textMuted, fontWeight: 400 }}>
                            {profile.userId}
                        </div>
                        {profile.profile.pronouns ? (
                            <div style={{ fontSize: 13, color: dc.textSecondary, marginTop: 2 }}>
                                {profile.profile.pronouns}
                            </div>
                        ) : null}
                    </div>

                    <div style={{ height: 1, background: dc.divider, margin: '0 0 12px' }} />

                    {/* About Me */}
                    {hasBio && (
                        <>
                            <p style={dc.sectionHeader}>About Me</p>
                            <div
                                style={{
                                    fontSize: 14,
                                    color: dc.textSecondary,
                                    lineHeight: 1.5,
                                    marginBottom: 12,
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: toSafeHtml(profile.profile.bio),
                                }}
                            />
                            <div
                                style={{ height: 1, background: dc.divider, margin: '0 0 12px' }}
                            />
                        </>
                    )}

                    {/* Connections */}
                    {hasConnections && (
                        <>
                            <p style={dc.sectionHeader}>Connected Accounts</p>
                            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                                {(profile.profile.connections ?? []).map((connection) => (
                                    <a
                                        key={`${connection.type}-${connection.url}`}
                                        href={connection.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            color: dc.textSecondary,
                                            textDecoration: 'none',
                                            fontSize: 14,
                                            padding: '6px 8px',
                                            borderRadius: 4,
                                            background: dc.panelBg,
                                        }}
                                    >
                                        <span
                                            style={{
                                                color: dc.blurple,
                                                fontWeight: 600,
                                                textTransform: 'capitalize',
                                            }}
                                        >
                                            {connection.type}
                                        </span>
                                        <span>
                                            {connection.label ??
                                                connection.username ??
                                                connection.url}
                                        </span>
                                    </a>
                                ))}
                            </div>
                            <div
                                style={{ height: 1, background: dc.divider, margin: '0 0 12px' }}
                            />
                        </>
                    )}

                    {/* Roles */}
                    {profile.roleBadges.length > 0 && (
                        <>
                            <p style={dc.sectionHeader}>Roles</p>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    marginBottom: 12,
                                }}
                            >
                                {profile.roleBadges.map((badge, i) => (
                                    <span
                                        key={badge}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            border: `1px solid ${dc.divider}`,
                                            borderRadius: 4,
                                            padding: '2px 8px 2px 6px',
                                            fontSize: 12,
                                            color: dc.textSecondary,
                                            background: dc.panelBg,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                background: getRoleColor(i),
                                                display: 'inline-block',
                                                flexShrink: 0,
                                            }}
                                        />
                                        {badge}
                                    </span>
                                ))}
                            </div>
                            <div
                                style={{ height: 1, background: dc.divider, margin: '0 0 12px' }}
                            />
                        </>
                    )}

                    {/* Mutual Spaces */}
                    {profile.mutualSpaces.length > 0 && (
                        <>
                            <p style={dc.sectionHeader}>
                                Mutual Servers — {profile.mutualSpaces.length}
                            </p>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    marginBottom: 12,
                                }}
                            >
                                {profile.mutualSpaces.map((space) => (
                                    <span
                                        key={space}
                                        style={{
                                            background: dc.panelBg,
                                            border: `1px solid ${dc.divider}`,
                                            borderRadius: 4,
                                            padding: '3px 8px',
                                            fontSize: 12,
                                            color: dc.textSecondary,
                                        }}
                                    >
                                        {space}
                                    </span>
                                ))}
                            </div>
                            <div
                                style={{ height: 1, background: dc.divider, margin: '0 0 12px' }}
                            />
                        </>
                    )}

                    {/* Footer buttons */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'flex-end',
                            marginTop: 4,
                        }}
                    >
                        {onBlock && (
                            <DcButton variant="danger" onClick={() => onBlock(profile.userId)}>
                                Block
                            </DcButton>
                        )}
                        <DcButton variant="secondary" onClick={onClose}>
                            Close
                        </DcButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
