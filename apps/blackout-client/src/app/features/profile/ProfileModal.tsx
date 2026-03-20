import { mdToHtml, sanitizeMatrixHtml } from '../../utils/markdown';
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

const toSafeHtml = (markdown: string | undefined): string => sanitizeMatrixHtml(mdToHtml(markdown ?? ''));

export const ProfileModal = ({ open, profile, onClose, onStartDm, onAddFriend, onBlock }: ProfileModalProps) => {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.58)', zIndex: 60 }} onClick={onClose}>
      <div
        style={{
          width: 760,
          maxWidth: '96vw',
          margin: '4vh auto',
          border: '1px solid var(--border-default)',
          borderRadius: 14,
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ height: 180, background: '#1f2a2e' }}>
          {profile.profile.banner ? <img src={profile.profile.banner} alt={`${profile.displayName} banner`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>

        <div style={{ padding: 16, marginTop: -48, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <AvatarDecoration avatarUrl={profile.avatarUrl} displayName={profile.displayName} decorationId={profile.profile.decoration} size={96} />
            <div>
              <h2 style={{ margin: 0 }}>{profile.displayName}</h2>
              {profile.profile.pronouns ? <div style={{ opacity: 0.8 }}>{profile.profile.pronouns}</div> : null}
              <code>{profile.userId}</code>
            </div>
          </div>

          <section>
            <h4 style={{ marginBottom: 6 }}>Role badges</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {profile.roleBadges.length === 0 ? <small>No shared space badges.</small> : null}
              {profile.roleBadges.map((badge) => (
                <span key={badge} style={{ border: '1px solid var(--border-default)', borderRadius: 999, padding: '3px 8px', background: 'var(--bg-input)' }}>
                  {badge}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: 6 }}>Bio</h4>
            <div style={{ lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: toSafeHtml(profile.profile.bio) }} />
          </section>

          <section>
            <h4 style={{ marginBottom: 6 }}>Connections</h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {(profile.profile.connections ?? []).length === 0 ? <small>No public links.</small> : null}
              {(profile.profile.connections ?? []).map((connection) => (
                <a key={`${connection.type}-${connection.url}`} href={connection.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>
                  {connection.type}: {connection.label ?? connection.username ?? connection.url}
                </a>
              ))}
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: 6 }}>Mutual spaces</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {profile.mutualSpaces.map((space) => (
                <span key={space} style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: '3px 8px' }}>
                  {space}
                </span>
              ))}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" onClick={() => onStartDm?.(profile.userId)}>DM</button>
            <button type="button" onClick={() => onAddFriend?.(profile.userId)}>{profile.isFriend ? 'Friends' : 'Add Friend'}</button>
            <button type="button" onClick={() => onBlock?.(profile.userId)}>Block</button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
