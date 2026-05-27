import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import {
    createVaultItem as apiCreate,
    deleteVaultItem as apiDelete,
    fetchVaultItems,
    type VaultItemView,
} from './vaultClient';
import {
    decryptSecret,
    deriveVaultKey,
    encryptSecret,
    getOrCreateVaultSalt,
} from './vaultCrypto';
import { ownedVaultTemplatesAtom, vaultSlotCapacityAtom } from './vaultGoodsAtoms';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

const inputStyle: CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const buttonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    cursor: 'pointer',
};

const itemRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
};

/**
 * Encrypted personal vault. All crypto happens here in the browser: a passphrase
 * unlocks (derives) the AES-GCM key, secrets are encrypted before they leave,
 * and the server only ever stores opaque ciphertext. The passphrase/key is held
 * in component state and discarded on lock or unmount.
 */
export const VaultPanel = (): JSX.Element => {
    const templates = useAtomValue(ownedVaultTemplatesAtom);
    const capacity = useAtomValue(vaultSlotCapacityAtom);

    const [key, setKey] = useState<CryptoKey | null>(null);
    const [passphrase, setPassphrase] = useState('');
    const [items, setItems] = useState<VaultItemView[]>([]);
    const [revealed, setRevealed] = useState<Record<string, string>>({});
    const [label, setLabel] = useState('');
    const [secret, setSecret] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const loadItems = useCallback(async () => {
        const { items: fetched } = await fetchVaultItems();
        setItems(fetched);
    }, []);

    useEffect(() => {
        if (key) void loadItems().catch(() => setError('Failed to load vault items.'));
    }, [key, loadItems]);

    const unlock = useCallback(async () => {
        if (passphrase.length < 8) {
            setError('Use a passphrase of at least 8 characters.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const derived = await deriveVaultKey(passphrase, getOrCreateVaultSalt());
            setKey(derived);
        } catch {
            setError('Could not unlock the vault.');
        } finally {
            setPassphrase('');
            setBusy(false);
        }
    }, [passphrase]);

    const lock = useCallback(() => {
        setKey(null);
        setRevealed({});
        setItems([]);
    }, []);

    const addItem = useCallback(async () => {
        if (!key || !label.trim() || !secret) return;
        if (items.length >= capacity) {
            setError(`Vault is full (${capacity} slots). Buy more slots to add items.`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const blob = await encryptSecret(key, secret);
            await apiCreate({ label: label.trim(), ...blob });
            setLabel('');
            setSecret('');
            await loadItems();
        } catch {
            setError('Failed to save item.');
        } finally {
            setBusy(false);
        }
    }, [key, label, secret, items.length, capacity, loadItems]);

    const reveal = useCallback(
        async (item: VaultItemView) => {
            if (!key) return;
            try {
                const plaintext = await decryptSecret(key, {
                    ciphertext: item.ciphertext,
                    iv: item.iv,
                    algo: 'AES-GCM',
                });
                setRevealed((prev) => ({ ...prev, [item.id]: plaintext }));
            } catch {
                setError('Wrong passphrase for this item, or it is corrupted.');
            }
        },
        [key]
    );

    const remove = useCallback(
        async (id: string) => {
            setBusy(true);
            try {
                await apiDelete(id);
                await loadItems();
            } finally {
                setBusy(false);
            }
        },
        [loadItems]
    );

    if (!key) {
        return (
            <div style={containerStyle} data-testid="vault-panel">
                <h3 style={{ margin: 0 }}>Encrypted vault</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Your passphrase encrypts everything in the browser. The server only stores
                    unreadable ciphertext — keep your passphrase safe, it cannot be recovered.
                </p>
                <input
                    type="password"
                    data-testid="vault-passphrase"
                    value={passphrase}
                    placeholder="Vault passphrase"
                    onChange={(e) => setPassphrase(e.target.value)}
                    style={inputStyle}
                />
                <button type="button" style={buttonStyle} onClick={() => void unlock()} disabled={busy}>
                    Unlock vault
                </button>
                {error ? (
                    <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>
                        {error}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <div style={containerStyle} data-testid="vault-panel-unlocked">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Encrypted vault</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {items.length} / {capacity} slots
                    <button
                        type="button"
                        onClick={lock}
                        style={{ ...inputStyle, marginLeft: 8, cursor: 'pointer' }}
                    >
                        Lock
                    </button>
                </span>
            </div>

            {templates.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Templates:</span>
                    {templates.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setLabel(t.templateLabel ?? t.name)}
                            style={{ ...inputStyle, cursor: 'pointer', fontSize: 12 }}
                        >
                            {t.name}
                        </button>
                    ))}
                </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                <input
                    data-testid="vault-item-label"
                    value={label}
                    placeholder="Label (e.g. API key)"
                    onChange={(e) => setLabel(e.target.value)}
                    style={inputStyle}
                />
                <input
                    data-testid="vault-item-secret"
                    type="password"
                    value={secret}
                    placeholder="Secret value"
                    onChange={(e) => setSecret(e.target.value)}
                    style={inputStyle}
                />
                <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => void addItem()}
                    disabled={busy || !label.trim() || !secret}
                >
                    Add
                </button>
            </div>

            {error ? (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>
                    {error}
                </p>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="vault-list">
                {items.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Vault is empty.</p>
                ) : (
                    items.map((item) => (
                        <div key={item.id} style={itemRowStyle} data-vault-item={item.id}>
                            <strong style={{ flex: 1 }}>{item.label}</strong>
                            {revealed[item.id] !== undefined ? (
                                <code style={{ fontSize: 12 }}>{revealed[item.id]}</code>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void reveal(item)}
                                    style={{ ...inputStyle, cursor: 'pointer', fontSize: 12 }}
                                >
                                    Reveal
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void remove(item.id)}
                                disabled={busy}
                                style={{ ...inputStyle, cursor: 'pointer', fontSize: 12 }}
                            >
                                Delete
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default VaultPanel;
