import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { settingsPageAtom, type SettingsSectionId } from '../../features/settings/settingsAtoms';
import { SettingsPage, isSettingsMobileViewport } from '../../features/settings/SettingsPage';
import {
    OnboardingWizard,
    WelcomeScreen,
    useOnboardingCompletion,
    useOnboardingContent,
} from '../../features/welcome';
import {
    getLegacyOverlayVisibility,
    parseLegacyOverlayId,
    withLegacyOverlay,
    withoutLegacyOverlay,
} from './legacyOverlayRouting';

const overlayBackdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 60,
    display: 'grid',
    placeItems: 'center',
    padding: 12,
};

const settingsPanelStyle = (mobile: boolean): CSSProperties => ({
    width: mobile ? '100%' : 'min(1200px, 96vw)',
    height: mobile ? '100%' : 'min(90vh, 920px)',
    background: 'var(--bg-surface)',
    borderRadius: mobile ? 0 : 14,
    border: '1px solid var(--border-default)',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    overflow: 'hidden',
});

const mapSectionFromSearch = (value: string | null): SettingsSectionId | null => {
    if (
        value === 'account' ||
        value === 'appearance' ||
        value === 'notifications' ||
        value === 'privacy' ||
        value === 'voice-video' ||
        value === 'accessibility' ||
        value === 'keybinds' ||
        value === 'developer' ||
        value === 'about'
    ) {
        return value;
    }
    return null;
};

const SpaceOverlaySurface = ({
    overlayId,
    spaceId,
    closeOverlay,
}: {
    overlayId: 'welcome' | 'onboarding';
    spaceId: string;
    closeOverlay: () => void;
}) => {
    const onboarding = useOnboardingContent(spaceId);
    const completion = useOnboardingCompletion(spaceId);
    const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

    useEffect(() => {
        let mounted = true;
        void completion.readCompletion().then((done) => {
            if (!mounted) return;
            setOnboardingCompleted(done);
        });
        return () => {
            mounted = false;
        };
    }, [completion, spaceId]);

    const canShowOnboarding = onboarding.data.enabled && onboardingCompleted === false;
    const visibility = getLegacyOverlayVisibility(overlayId, true, canShowOnboarding);

    useEffect(() => {
        if (overlayId === 'onboarding' && !visibility.onboarding) {
            closeOverlay();
        }
    }, [closeOverlay, overlayId, visibility.onboarding]);

    if (visibility.welcome) {
        return (
            <div style={overlayBackdrop} onClick={closeOverlay}>
                <div
                    style={{
                        width: 'min(1080px, 96vw)',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        border: '1px solid var(--border-default)',
                        borderRadius: 14,
                        background: 'var(--bg-surface)',
                        padding: 12,
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <strong>Welcome</strong>
                        <button type="button" onClick={closeOverlay}>
                            Close
                        </button>
                    </div>
                    <WelcomeScreen
                        spaceId={spaceId}
                        actionLabel="Explore"
                        onJoinOrExplore={closeOverlay}
                        onPickChannel={closeOverlay}
                    />
                </div>
            </div>
        );
    }

    if (visibility.onboarding) {
        return (
            <OnboardingWizard
                spaceId={spaceId}
                open
                onClose={closeOverlay}
                onComplete={closeOverlay}
            />
        );
    }

    return null;
};

export const LegacyOverlayHost = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const setSettingsPage = useSetAtom(settingsPageAtom);
    const [mobile, setMobile] = useState(isSettingsMobileViewport(window.innerWidth));

    useEffect(() => {
        const onResize = () => setMobile(isSettingsMobileViewport(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const overlayId = parseLegacyOverlayId(searchParams.get('overlay'));
    const explicitSpaceId = searchParams.get('overlaySpace');
    const routedSpaceId = params.spaceIdOrAlias;
    const spaceId = explicitSpaceId ?? routedSpaceId ?? null;

    const closeOverlay = () => {
        void navigate({ pathname: location.pathname, search: withoutLegacyOverlay(location.search) });
    };

    useEffect(() => {
        if (!overlayId) return;
        if (overlayId === 'settings') {
            const section = mapSectionFromSearch(searchParams.get('settingsSection'));
            if (section) {
                setSettingsPage(section);
            }
            return;
        }

        if (!spaceId) {
            closeOverlay();
        }
    }, [overlayId, searchParams, setSettingsPage, spaceId]);

    if (!overlayId) return null;

    if (overlayId === 'settings') {
        return (
            <div style={overlayBackdrop} onClick={closeOverlay} data-testid="legacy-settings-overlay">
                <div style={settingsPanelStyle(mobile)} onClick={(event) => event.stopPropagation()}>
                    <header
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border-default)',
                        }}
                    >
                        <strong>Settings</strong>
                        <button type="button" onClick={closeOverlay}>
                            Close
                        </button>
                    </header>
                    <main style={{ padding: 12, overflow: 'auto' }}>
                        <SettingsPage />
                    </main>
                </div>
            </div>
        );
    }

    if (!spaceId) return null;

    return <SpaceOverlaySurface overlayId={overlayId} spaceId={spaceId} closeOverlay={closeOverlay} />;
};

export const openLegacyOverlaySearch = (
    search: string,
    overlayId: 'settings' | 'welcome' | 'onboarding',
    spaceId?: string,
) => withLegacyOverlay(search, overlayId, spaceId);

export default LegacyOverlayHost;
