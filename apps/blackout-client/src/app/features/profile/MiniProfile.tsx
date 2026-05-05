import { mdToHtml, sanitizeMatrixHtml } from '../../plugins/markdown/matrixMarkdownUtils';
import AvatarDecoration from './AvatarDecoration';
import type { MemberProfile } from './profileTypes';

// Old Discord color palette
const dc = {
    cardBg: '#18191C',
    panelBg: '#2F3136',
    blurple: '#7289DA',
    textPrimary: '#FFFFFF',
    textSecondary: '#B9BBBE',
    textMuted: '#72767D',
    divider: '#42454A',
    inputBg: '#40444B',
    green: '#43B581',
    avatarBorder: '#18191C',
};

export const MiniProfile = ({
    profile,
    onDm,
    onMention,
}: {
    profile: MemberProfile;
    onDm?: (userId: string) => void;
    onMention?: (userId: string) => void;
}) => {
    const preview = (profile.profile.bio ?? '').split('\n').slice(0, 2).join('\n');

    return (
        <article
            style={{
                width: 300,
                borderRadius: 8,
                background: dc.cardBg,
                overflow: 'hidden',
                boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
                fontFamily: 'Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif',
                color: dc.textPrimary,
            }}
        >
            {/* Mini banner */}
            <div
                style={{
                    height: 60,
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
            </div>

            {/* Avatar */}
            <div style={{ padding: '0 12px', position: 'relative', height: 36 }}>
                <div style={{ position: 'absolute', top: -28, left: 12, lineHeight: 0 }}>
                    <div
                        style={{
                            borderRadius: '50%',
                            background: dc.avatarBorder,
                            padding: 4,
                            display: 'inline-block',
                            lineHeight: 0,
                            position: 'relative',
                        }}
                    >
                        <AvatarDecoration
                            avatarUrl={profile.avatarUrl}
                            displayName={profile.displayName}
                            decorationId={profile.profile.decoration}
                            size={58}
                        />

                        {/* Status dot */}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 4,
                                right: 4,
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: dc.green,
                                border: `3px solid ${dc.avatarBorder}`,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '4px 12px 12px' }}>
                <div style={{ marginBottom: 8 }}>
                    <strong style={{ fontSize: 16, fontWeight: 700, color: dc.textPrimary }}>
                        {profile.displayName}
                    </strong>
                    {profile.profile.pronouns ? (
                        <div style={{ fontSize: 12, color: dc.textMuted }}>
                            {profile.profile.pronouns}
                        </div>
                    ) : null}
                    {profile.primaryRole ? (
                        <div style={{ fontSize: 12, color: dc.textSecondary }}>
                            {profile.primaryRole}
                        </div>
                    ) : null}
                </div>

                {preview.trim().length > 0 && (
                    <>
                        <div style={{ height: 1, background: dc.divider, margin: '8px 0' }} />
                        <p
                            style={{
                                margin: '0 0 4px',
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                color: dc.textSecondary,
                            }}
                        >
                            About Me
                        </p>
                        <div
                            style={{ fontSize: 13, color: dc.textSecondary, lineHeight: 1.45 }}
                            dangerouslySetInnerHTML={{
                                __html: sanitizeMatrixHtml(mdToHtml(preview)),
                            }}
                        />
                    </>
                )}

                <div style={{ height: 1, background: dc.divider, margin: '8px 0' }} />

                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        type="button"
                        onClick={() => onDm?.(profile.userId)}
                        style={{
                            background: dc.blurple,
                            color: dc.textPrimary,
                            border: 'none',
                            borderRadius: 3,
                            padding: '0 12px',
                            height: 28,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Message
                    </button>
                    <button
                        type="button"
                        onClick={() => onMention?.(profile.userId)}
                        style={{
                            background: dc.inputBg,
                            color: dc.textPrimary,
                            border: 'none',
                            borderRadius: 3,
                            padding: '0 12px',
                            height: 28,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Mention
                    </button>
                </div>
            </div>
        </article>
    );
};

export default MiniProfile;
