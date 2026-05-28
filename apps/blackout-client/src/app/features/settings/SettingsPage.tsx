import React, {
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
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

const AccountSettings = lazy(() => import('./AccountSettings'));
const AppearanceSettings = lazy(() => import('./AppearanceSettings'));
const NotificationSettings = lazy(() => import('./NotificationSettings'));
const PrivacySettings = lazy(() => import('./PrivacySettings'));
const PrivacyToolsSettings = lazy(() => import('../privacy-tools/PrivacyToolsSettings'));
const DataTransparencySettings = lazy(() => import('../data-transparency/DataTransparencySettings'));
const BurnerIdentitiesPanel = lazy(() => import('../burner-identity/BurnerIdentitiesPanel'));
const VoiceVideoSettings = lazy(() => import('./VoiceVideoSettings'));
const AccessibilitySettings = lazy(() => import('./AccessibilitySettings'));
const KeybindsSettings = lazy(() => import('./KeybindsSettings'));
const DeveloperSettings = lazy(() => import('./DeveloperSettings'));
const AboutSettings = lazy(() => import('./AboutSettings'));
const BugReportSettings = lazy(() => import('./BugReportSettings'));
const CharacterSheetSection = lazy(() =>
    import('../character-sheet/CharacterSheet').then((m) => ({ default: m.CharacterSheet })),
);

interface SettingsSection {
    id: SettingsSectionId;
    label: string;
    summary: string;
    component: LazyExoticComponent<ComponentType>;
}

interface SettingsGroup {
    id: string;
    label: string;
    sectionIds: SettingsSectionId[];
}

const groups: SettingsGroup[] = [
    {
        id: 'identity',
        label: 'Account & identity',
        sectionIds: ['account', 'identities', 'character-sheet', 'about'],
    },
    {
        id: 'look-feel',
        label: 'Look & feel',
        sectionIds: ['appearance', 'accessibility', 'keybinds'],
    },
    {
        id: 'privacy-notifications',
        label: 'Privacy & notifications',
        sectionIds: ['privacy', 'privacy-tools', 'data-transparency', 'notifications', 'voice-video'],
    },
    {
        id: 'help-advanced',
        label: 'Help & advanced',
        sectionIds: ['developer', 'bug-report'],
    },
];

const sections: SettingsSection[] = [
    {
        id: 'account',
        label: 'Account',
        summary: 'Profile, credentials, and active sessions',
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
        summary: `Global rules, per-${BLACKOUT_TERMS.den.singular} overrides, sounds`,
        component: NotificationSettings,
    },
    {
        id: 'privacy',
        label: 'Privacy',
        summary: 'Blocked users, direct-message permissions, read receipts',
        component: PrivacySettings,
    },
    {
        id: 'privacy-tools',
        label: 'Privacy Tools',
        summary: 'Metadata stripping and link sanitization for uploads & messages',
        component: PrivacyToolsSettings,
    },
    {
        id: 'data-transparency',
        label: 'Your data',
        summary: "What's stored about you on this homeserver",
        component: DataTransparencySettings,
    },
    {
        id: 'identities',
        label: 'Burner identities',
        summary: 'Create disposable identities and burn them when done',
        component: BurnerIdentitiesPanel,
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
        id: 'bug-report',
        label: 'Report a bug',
        summary: 'File a public GitHub issue with optional diagnostics',
        component: BugReportSettings,
    },
    {
        id: 'character-sheet',
        label: 'Character sheet',
        summary: 'Your first playbook, roles you carry, and your quest log',
        component: CharacterSheetSection,
    },
    {
        id: 'about',
        label: 'About',
        summary: 'Version, support, and repository links',
        component: AboutSettings,
    },
];

export const settingsLayoutMetrics = Object.freeze({
    mobileMaxWidthPx: designBreakpoints.mobileMaxPx,
    panelPaddingPx: designShellLayout.desktopPanelPaddingPx,
    sectionGapPx: designSpacing.comfortableGapPx,
    itemGapPx: designSpacing.comfortableGapPx,
    minTouchTargetPx: designShellLayout.navRailButtonSizePx,
});

export const isSettingsMobileViewport = (width: number): boolean =>
    width <= settingsLayoutMetrics.mobileMaxWidthPx;

export const SettingsPage = () => {
    const [activeSection, setActiveSection] = useAtom(settingsPageAtom);
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? isSettingsMobileViewport(window.innerWidth) : false,
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
                gridTemplateColumns: isMobile ? '1fr' : '300px minmax(0, 1fr)',
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
                    padding: settingsLayoutMetrics.panelPaddingPx,
                    background: 'var(--bg-input)',
                }}
            >
                <h2 style={{ marginTop: 0, marginBottom: 10 }}>Settings</h2>
                <nav style={{ display: 'grid', gap: settingsLayoutMetrics.sectionGapPx }}>
                    {groups.map((group) => {
                        const groupSections = group.sectionIds
                            .map((id) => sections.find((s) => s.id === id))
                            .filter((s): s is SettingsSection => Boolean(s));
                        if (groupSections.length === 0) return null;
                        return (
                            <div
                                key={group.id}
                                style={{
                                    display: 'grid',
                                    gap: settingsLayoutMetrics.itemGapPx,
                                }}
                            >
                                <div
                                    role="presentation"
                                    style={{
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                        opacity: 0.7,
                                        padding: `0 4px`,
                                    }}
                                >
                                    {group.label}
                                </div>
                                {groupSections.map((section) => (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveSection(section.id);
                                            trackSettingsInteraction(
                                                'settings',
                                                'navigate-section',
                                                section.id,
                                            );
                                        }}
                                        style={{
                                            textAlign: 'left',
                                            border:
                                                activeSection === section.id
                                                    ? '1px solid var(--accent-primary)'
                                                    : '1px solid var(--border-default)',
                                            borderRadius: 8,
                                            padding: `8px ${settingsLayoutMetrics.sectionGapPx}px`,
                                            background:
                                                activeSection === section.id
                                                    ? 'var(--bg-surface)'
                                                    : 'var(--bg-input)',
                                            color: 'var(--text-primary)',
                                            display: 'grid',
                                            gap: 2,
                                        }}
                                    >
                                        <strong>{section.label}</strong>
                                        <small style={{ opacity: 0.8 }}>{section.summary}</small>
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </nav>
            </aside>

            <main style={{ padding: settingsLayoutMetrics.panelPaddingPx }}>
                <Suspense fallback={<p>Loading {active.label} settings...</p>}>
                    <ActiveSection />
                </Suspense>
            </main>
        </section>
    );
};

export default SettingsPage;
