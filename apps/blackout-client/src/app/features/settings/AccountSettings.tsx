import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { MiniProfile, ProfileEditor, ProfileModal, myProfileAtom } from '../profile';

const AccountSettings = () => {
  const profile = useAtomValue(myProfileAtom);
  const [openPreview, setOpenPreview] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <h3 style={{ marginTop: 0 }}>Account</h3>
        <p style={{ marginTop: 0, opacity: 0.85 }}>Manage your profile data, account credentials, and active sessions.</p>
      </section>

      <ProfileEditor />

      <section>
        <h4 style={{ marginBottom: 8 }}>Mini profile card</h4>
        <MiniProfile profile={profile} onDm={(userId) => void userId} onMention={(userId) => void userId} />
      </section>

      <section style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpenPreview(true)}>
          Preview Profile Modal
        </button>
      </section>

      <ProfileModal
        open={openPreview}
        profile={profile}
        onClose={() => setOpenPreview(false)}
        onAddFriend={(userId) => void userId}
        onBlock={(userId) => void userId}
        onStartDm={(userId) => void userId}
      />
    </div>
  );
};

export default AccountSettings;
