import { useAtom, useAtomValue } from 'jotai';
import { privacyToolsEntitledAtom, privacyToolsSettingsAtom } from './privacyToolsAtoms';
import { openPrivacyUpgradeFlow } from './privacyToolsTelemetry';
import { useHardeningFeatures } from './useHardeningFeatures';

type PrivacyToolsSettingsProps = {
    requestClose?: () => void;
};

export function PrivacyToolsSettings({ requestClose }: PrivacyToolsSettingsProps = {}) {
    const [settings, setSettings] = useAtom(privacyToolsSettingsAtom);
    const advancedEntitled = useAtomValue(privacyToolsEntitledAtom);
    // Tier-aware hardening entitlements (advisory until a global entitlements
    // atom lands; the operative gate stays `advancedEntitled` for now).
    const hardening = useHardeningFeatures();

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Privacy Tools</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            {/* Until 2026-11-16 this said both were "always on". They were
                not, and still are not everywhere; this says where they are.
                docs/security/trust-claims-2026-11-16.md, T12. */}
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Before a picture leaves this device, this app removes its metadata, such as where
                and when it was taken, if it is a JPEG, PNG or WebP: pictures attached to messages,
                avatars, profile banners, listing photos, role icons and welcome images. Pictures in
                other formats (such as HEIC from an iPhone) and all videos are sent as they are, and
                the message box says so when you attach one. Emoji and stickers are uploaded as they
                are.
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Tracking parameters (utm_ tags, fbclid and the like) are removed from links in
                messages, forum posts and replies, and wall posts.
            </p>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Advanced privacy controls</strong>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        data-testid="feature-toggle-privacy-hardening"
                        checked={settings.avatarPerturbationEnabled}
                        disabled={!advancedEntitled}
                        onChange={(event) =>
                            setSettings((prev) => ({
                                ...prev,
                                avatarPerturbationEnabled: event.target.checked,
                            }))
                        }
                    />
                    Add a faint pattern to avatars (Advanced). It changes the picture&apos;s
                    fingerprint; it does not stop current face recognition.
                    {hardening.imagePerturbation ? null : (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pro</span>
                    )}
                </label>
                <button
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={advancedEntitled}
                    onClick={() => openPrivacyUpgradeFlow('settings_privacy_tools')}
                >
                    {advancedEntitled ? 'Advanced unlocked' : 'Upgrade for Advanced'}
                </button>
            </div>
        </section>
    );
}

export default PrivacyToolsSettings;
