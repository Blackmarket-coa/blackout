import { mdToHtml, sanitizeMatrixHtml } from '../../utils/markdown';
import AvatarDecoration from './AvatarDecoration';
import type { MemberProfile } from './profileTypes';

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
    <article style={{ width: 320, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)', padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <AvatarDecoration avatarUrl={profile.avatarUrl} displayName={profile.displayName} decorationId={profile.profile.decoration} size={58} />
        <div>
          <strong>{profile.displayName}</strong>
          {profile.profile.pronouns ? <div style={{ opacity: 0.8 }}>{profile.profile.pronouns}</div> : null}
          {profile.primaryRole ? <small>{profile.primaryRole}</small> : null}
        </div>
      </div>

      <div style={{ opacity: 0.92, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: sanitizeMatrixHtml(mdToHtml(preview)) }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onDm?.(profile.userId)}>DM</button>
        <button type="button" onClick={() => onMention?.(profile.userId)}>Mention</button>
      </div>
    </article>
  );
};

export default MiniProfile;
