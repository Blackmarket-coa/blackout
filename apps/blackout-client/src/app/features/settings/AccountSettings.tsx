import PlaceholderSection from './PlaceholderSection';

const AccountSettings = () => (
  <PlaceholderSection
    title="Account"
    description="Manage your profile and active sessions."
    items={['Display name', 'Avatar', 'Email', 'Password', 'Sessions']}
  />
);

export default AccountSettings;
