import { useState } from 'react';
import { useAtom } from 'jotai';
import { stegoEnterprisePolicyAtom, stegoSettingsAtom } from './stegoAtoms';
import { openStegoUpgradeFlow } from './stegoTelemetry';
import {
    applyStegoPolicyLifecycleAction,
    canExecuteStegoPolicyAction,
    type StegoPolicyLifecycleAction,
} from './stegoPolicyLifecycle';

type StegoSettingsProps = {
    requestClose?: () => void;
};

export function StegoSettings({ requestClose }: StegoSettingsProps = {}) {
    const [settings, setSettings] = useAtom(stegoSettingsAtom);
    const [enterprisePolicy, setEnterprisePolicy] = useAtom(stegoEnterprisePolicyAtom);
    const [label, setLabel] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [policyReason, setPolicyReason] = useState('Governance lifecycle update');
    const lifecycleActions: StegoPolicyLifecycleAction[] = [
        'activate',
        'suspend',
        'rotate_keys',
        'revoke',
        'archive',
    ];

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Steganography</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(event) =>
                        setSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                    }
                />
                Enable hidden message detection
            </label>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Saved passphrases</strong>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {settings.savedPassphrases.length === 0 ? (
                        <small>No saved passphrases yet.</small>
                    ) : null}
                    {settings.savedPassphrases.map((entry) => (
                        <div
                            key={entry.id}
                            style={{ display: 'flex', justifyContent: 'space-between' }}
                        >
                            <span>{entry.label}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        savedPassphrases: prev.savedPassphrases.filter(
                                            (item) => item.id !== entry.id
                                        ),
                                    }))
                                }
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                    <input
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="Passphrase label"
                    />
                    <input
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                        placeholder="Passphrase"
                        type="password"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (!label.trim() || !passphrase.trim()) return;
                            setSettings((prev) => ({
                                ...prev,
                                savedPassphrases: [
                                    ...prev.savedPassphrases,
                                    {
                                        id: `${Date.now()}`,
                                        label: label.trim(),
                                        passphrase: passphrase.trim(),
                                    },
                                ],
                            }));
                            setLabel('');
                            setPassphrase('');
                        }}
                    >
                        Save passphrase
                    </button>
                </div>
            </div>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Advanced stego controls</strong>
                <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                    Multi-carrier routing (Advanced)
                    <select disabled={!settings.advancedEntitled}>
                        <option>Single image carrier</option>
                        <option>Image + audio carrier</option>
                    </select>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.advancedOptions.expiryRemoteBurn}
                        disabled
                        readOnly
                    />
                    Expiry / remote burn (Advanced)
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.advancedOptions.policyAudit}
                        disabled
                        readOnly
                    />
                    Policy audit trail (Advanced)
                </label>
                <button
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={settings.advancedEntitled}
                    onClick={() => openStegoUpgradeFlow('settings_advanced_controls')}
                >
                    Upgrade for Advanced
                </button>
            </div>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Enterprise policy lifecycle</strong>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        checked={enterprisePolicy.enabled}
                        onChange={(event) =>
                            setEnterprisePolicy((prev) => ({
                                ...prev,
                                enabled: event.target.checked,
                            }))
                        }
                    />
                    Enable enterprise stego policy plugin
                </label>
                <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>
                    Status: {enterprisePolicy.status} · Governance approvals:{' '}
                    {enterprisePolicy.governance.approvals.length}/
                    {enterprisePolicy.governance.requiredApprovals}
                </small>
                <input
                    style={{ marginTop: 8, width: '100%' }}
                    value={policyReason}
                    onChange={(event) => setPolicyReason(event.target.value)}
                    placeholder="Lifecycle reason"
                    disabled={!enterprisePolicy.enabled}
                />
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {lifecycleActions.map((action) => {
                        const decision = canExecuteStegoPolicyAction(enterprisePolicy, action);
                        return (
                            <button
                                key={action}
                                type="button"
                                disabled={!decision.allowed}
                                title={decision.reason}
                                onClick={() => {
                                    try {
                                        const { next } = applyStegoPolicyLifecycleAction(
                                            enterprisePolicy,
                                            action,
                                            policyReason
                                        );
                                        setEnterprisePolicy(next);
                                    } catch {
                                        // no-op
                                    }
                                }}
                            >
                                {action.replace('_', ' ')}
                            </button>
                        );
                    })}
                </div>
                <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)' }}>
                    Auditable events captured: {enterprisePolicy.auditLog.length}
                </small>
            </div>
        </section>
    );
}

export default StegoSettings;
