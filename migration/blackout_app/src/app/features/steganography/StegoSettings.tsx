import { useState } from 'react';
import { useAtom } from 'jotai';
import { stegoSettingsAtom } from './stegoAtoms';

export const StegoSettings = () => {
    const [settings, setSettings] = useAtom(stegoSettingsAtom);
    const [label, setLabel] = useState('');
    const [passphrase, setPassphrase] = useState('');

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ marginBottom: 0 }}>Steganography</h3>
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
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span>{entry.label}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        savedPassphrases: prev.savedPassphrases.filter(
                                            (item) => item.id !== entry.id,
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
        </section>
    );
};

export default StegoSettings;
