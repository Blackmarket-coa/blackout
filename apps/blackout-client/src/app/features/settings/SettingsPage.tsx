import { Suspense, lazy, useMemo, useState, type ComponentType, type LazyExoticComponent } from 'react';

const AccountSettings = lazy(() => import('./AccountSettings'));
const AppearanceSettings = lazy(() => import('./AppearanceSettings'));
const NotificationSettings = lazy(() => import('./NotificationSettings'));
const PrivacySettings = lazy(() => import('./PrivacySettings'));
const VoiceVideoSettings = lazy(() => import('./VoiceVideoSettings'));
const AccessibilitySettings = lazy(() => import('./AccessibilitySettings'));
const KeybindsSettings = lazy(() => import('./KeybindsSettings'));
const DeveloperSettings = lazy(() => import('./DeveloperSettings'));
const AboutSettings = lazy(() => import('./AboutSettings'));

type SettingsSectionId =
  | 'account'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'voice-video'
  | 'accessibility'
  | 'keybinds'
  | 'developer'
  | 'about';

const sections: Array<{ id: SettingsSectionId; label: string; component: LazyExoticComponent<ComponentType> }> = [
  { id: 'account', label: 'Account', component: AccountSettings },
  { id: 'appearance', label: 'Appearance', component: AppearanceSettings },
  { id: 'notifications', label: 'Notifications', component: NotificationSettings },
  { id: 'privacy', label: 'Privacy', component: PrivacySettings },
  { id: 'voice-video', label: 'Voice & Video', component: VoiceVideoSettings },
  { id: 'accessibility', label: 'Accessibility', component: AccessibilitySettings },
  { id: 'keybinds', label: 'Keybinds', component: KeybindsSettings },
  { id: 'developer', label: 'Developer', component: DeveloperSettings },
  { id: 'about', label: 'About', component: AboutSettings },
];

export const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');

  const ActiveSection = useMemo(
    () => sections.find((section) => section.id === activeSection)?.component ?? AppearanceSettings,
    [activeSection],
  );

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        minHeight: '100%',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
      }}
    >
      <aside style={{ borderRight: '1px solid var(--border-default)', padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <nav style={{ display: 'grid', gap: 6 }}>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              style={{
                textAlign: 'left',
                border: activeSection === section.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                borderRadius: 8,
                padding: '8px 10px',
                background: activeSection === section.id ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ padding: 16 }}>
        <Suspense fallback={<p>Loading settings section…</p>}>
          <ActiveSection />
        </Suspense>
      </main>
    </section>
  );
};

export default SettingsPage;
