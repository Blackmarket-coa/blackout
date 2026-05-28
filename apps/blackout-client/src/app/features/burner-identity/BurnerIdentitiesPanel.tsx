import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { activeBurnerAtom } from './burnerAtoms';
import { useBurnerIdentities } from './useBurnerIdentities';

export function BurnerIdentitiesPanel() {
    const { burners, isBurnerActive, busy, error, createBurner, switchTo, switchBack, burn } =
        useBurnerIdentities();
    const activeUserId = useAtomValue(userIdAtom);
    const activeBurner = useAtomValue(activeBurnerAtom);
    const [label, setLabel] = useState('');

    const onCreate = () => {
        const name = label.trim() || 'Burner';
        void createBurner(name).then(() => setLabel(''));
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Burner identities</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Spin up a disposable identity for one-off activity, then burn it when you&apos;re
                done. Entering a burner switches the whole app to it — switch back to your primary
                account anytime. Burning deactivates the account on the server; people you messaged
                keep their own copies of what you already sent.
            </p>

            {isBurnerActive ? (
                <div
                    style={{
                        border: '1px solid var(--accent-primary)',
                        borderRadius: 10,
                        padding: 10,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span>
                        You are in burner mode as{' '}
                        <strong>{activeBurner?.label ?? activeUserId}</strong>.
                    </span>
                    <button type="button" disabled={busy} onClick={() => void switchBack()}>
                        Exit burner mode
                    </button>
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Burner label (e.g. Tip line)"
                    maxLength={80}
                    style={{ flex: 1 }}
                />
                <button type="button" disabled={busy} onClick={onCreate}>
                    Create &amp; enter burner
                </button>
            </div>

            {error ? (
                <small style={{ color: 'var(--danger, #d33)' }} role="alert">
                    {error}
                </small>
            ) : null}

            <div style={{ display: 'grid', gap: 8 }}>
                {burners.length === 0 ? (
                    <small style={{ color: 'var(--text-secondary)' }}>
                        No burner identities yet.
                    </small>
                ) : null}
                {burners.map((burner) => {
                    const isActive = burner.burnerUserId === activeUserId;
                    return (
                        <div
                            key={burner.id}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 10,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <div style={{ display: 'grid' }}>
                                <strong>{burner.label}</strong>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {burner.burnerUserId}
                                    {isActive ? ' · active' : ''}
                                </small>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {isActive ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void switchBack()}
                                    >
                                        Switch back
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void switchTo(burner.burnerUserId)}
                                    >
                                        Switch to
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void burn(burner.burnerUserId)}
                                >
                                    Burn
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default BurnerIdentitiesPanel;
