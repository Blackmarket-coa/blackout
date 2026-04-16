import {
    Suspense,
    lazy,
    type ComponentType,
    type LazyExoticComponent,
    useEffect,
    useState,
} from 'react';
import { useAtom } from 'jotai';
import {
    designBreakpoints,
    designShellLayout,
    designSpacing,
} from '../../../../../../packages/design/src';
import { settingsPageAtom, type SettingsSectionId } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';

const AccountSettings = lazy(() => import('./AccountSettings'));
const AppearanceSettings = lazy(() => import('./AppearanceSettings'));
const NotificationSettings = lazy(() => import('./NotificationSettings'));
const PrivacySettings = lazy(() => import('./PrivacySettings'));
const VoiceVideoSettings = lazy(() => import('./VoiceVideoSettings'));
const AccessibilitySettings = lazy(() => import('./AccessibilitySettings'));
const KeybindsSettings = lazy(() => import('./KeybindsSettings'));
const DeveloperSettings = lazy(() => import('./DeveloperSettings'));
const AboutSettings = lazy(() => import('./AboutSettings'));

interface SettingsSection {
    id: SettingsSectionId;
    label: string;
    summary: string;
    component: LazyExoticComponent<ComponentType>;
}

export const settingsLayoutMetrics = Object.freeze({
    mobileMaxWidthPx: designBreakpoints.mobileMaxPx,
    desktopSidebarWidthPx: 300,
    panelPaddingPx: designShellLayout.desktopPanelPaddingPx,
    sectionGapPx: designSpacing.comfortableGapPx,
    itemGapPx: designSpacing.denseGapPx,
    minTouchTargetPx: designShellLayout.navRailButtonSizePx,
});

export const isSettingsMobileViewport = (width: number) =>
    width <= settingsLayoutMetrics.mobileMaxWidthPx;

const sections: SettingsSection[] = [
    {
        id: 'account',
        label: 'Account',
        summary: 'Display name, avatar, email, password, sessions',
        component: AccountSettings,
    },
    {
        id: 'appearance',
        label: 'Appearance',
        summary: 'Theme, font scale, density, emoji style',
        component: AppearanceSettings,
    },
    {
        id: 'notifications',
        label: 'Notifications',
        summary: 'Global rules, per-room overrides, sounds',
        component: NotificationSettings,
    },
    {
        id: 'privacy',
        label: 'Privacy',
        summary: 'Blocked users, DM permissions, read receipts',
        component: PrivacySettings,
    },
    {
        id: 'voice-video',
        label: 'Voice & Video',
        summary: 'Devices and noise suppression',
        component: VoiceVideoSettings,
    },
    {
        id: 'accessibility',
        label: 'Accessibility',
        summary: 'Reduced motion, screen reader, high contrast',
        component: AccessibilitySettings,
    },
    {
        id: 'keybinds',
        label: 'Keybinds',
        summary: 'Keyboard shortcut customization',
        component: KeybindsSettings,
    },
    {
        id: 'developer',
        label: 'Developer',
        summary: 'Developer mode, diagnostics bundle export',
        component: DeveloperSettings,
    },
    {
        id: 'about',
        label: 'About',
        summary: 'Version, support, and contact links',
        component: AboutSettings,
    },
];

export const SettingsPage = () => {
    const [activeSection, setActiveSection] = useAtom(settingsPageAtom);
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? isSettingsMobileViewport(window.innerWidth) : false
    );

    useEffect(() => {
        const onResize = () => setIsMobile(isSettingsMobileViewport(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const active = sections.find((section) => section.id === activeSection) ?? sections[1];
    const ActiveSection = active.component;

    return (
        <section
            style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                    ? '1fr'
                    : `${settingsLayoutMetrics.desktopSidebarWidthPx}px minmax(0, 1fr)`,
                minHeight: '100%',
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
            }}
        >
            <aside
                style={{
                    borderRight: isMobile ? 'none' : '1px solid var(--border-default)',
                    borderBottom: isMobile ? '1px solid var(--border-default)' : 'none',
                    padding: settingsLayoutMetrics.sectionGapPx,
                    background: 'var(--bg-input)',
                }}
            >
                <h2 style={{ marginTop: 0, marginBottom: designSpacing.compactGapPx }}>Settings</h2>
                <nav style={{ display: 'grid', gap: settingsLayoutMetrics.itemGapPx }}>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => {
                                setActiveSection(section.id);
                                trackSettingsInteraction(
                                    'settings',
                                    'navigate-section',
                                    section.id
                                );
                            }}
                            style={{
                                textAlign: 'left',
                                border:
                                    activeSection === section.id
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: `${designSpacing.compactGapPx}px ${designSpacing.comfortableGapPx}px`,
                                minHeight: settingsLayoutMetrics.minTouchTargetPx,
                                background:
                                    activeSection === section.id
                                        ? 'var(--bg-surface)'
                                        : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                display: 'grid',
                                alignContent: 'center',
                                gap: 2,
                            }}
                        >
                            <strong>{section.label}</strong>
                            <small style={{ opacity: 0.8 }}>{section.summary}</small>
                        </button>
                    ))}
                </nav>
            </aside>

            <main style={{ padding: settingsLayoutMetrics.panelPaddingPx }}>
                <Suspense fallback={<p>Loading {active.label} settings…</p>}>
                    <ActiveSection />
                </Suspense>
            </main>
        </section>
    );
};

export default SettingsPage;
