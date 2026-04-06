import { useAtom } from 'jotai';
import { privacySettingsAtom, type DmPermission } from './settingsAtoms';

const dmOptions: Array<{ value: DmPermission; label: string }> = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'friends', label: 'Friends' },
    { value: 'mutual-spaces', label: 'Mutual Spaces' },
    { value: 'nobody', label: 'Nobody' },
];

export const PrivacySettings = () => {
    const [settings, setSettings] = useAtom(privacySettingsAtom);

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <section>
                <h3>Blocked users</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                    {settings.blockedUsers.length === 0 ? <small>No blocked users.</small> : null}
                    {settings.blockedUsers.map((user) => (
                        <div
                            key={user.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: 8,
                            }}
                        >
                            <div>
                                <strong>{user.displayName}</strong>
                                <div>
                                    <code>{user.id}</code>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        blockedUsers: prev.blockedUsers.filter(
                                            (entry) => entry.id !== user.id,
                                        ),
                                    }))
                                }
                            >
                                Unblock
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h3>DM permissions</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {dmOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                                setSettings((prev) => ({ ...prev, dmPermissions: option.value }))
                            }
                            style={{
                                border:
                                    settings.dmPermissions === option.value
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                background:
                                    settings.dmPermissions === option.value
                                        ? 'var(--bg-surface-hover)'
                                        : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showReadReceipts}
                    onChange={(event) =>
                        setSettings((prev) => ({ ...prev, showReadReceipts: event.target.checked }))
                    }
                />
                Read receipt visibility
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showTypingIndicators}
                    onChange={(event) =>
                        setSettings((prev) => ({
                            ...prev,
                            showTypingIndicators: event.target.checked,
                        }))
                    }
                />
                Typing indicator visibility
            </label>
        </div>
    );
};

export default PrivacySettings;
