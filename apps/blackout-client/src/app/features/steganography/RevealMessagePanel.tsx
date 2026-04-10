import { useState } from 'react';
import { fetchBlob } from '@blackout/sdk';
import { decodeMessageFromImage } from './SteganographyDecoder';

interface RevealMessagePanelProps {
    imageUrl: string;
}

export const RevealMessagePanel = ({ imageUrl }: RevealMessagePanelProps) => {
    const [passphrase, setPassphrase] = useState('');
    const [revealed, setRevealed] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    return (
        <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--accent-primary)' }}>
                🔐 Hidden content detected
            </summary>
            <div
                style={{
                    marginTop: 8,
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    padding: 8,
                }}
            >
                <label style={{ display: 'grid', gap: 6 }}>
                    Enter passphrase to reveal
                    <input
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                    />
                </label>

                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={async () => {
                            setLoading(true);
                            setError(null);
                            setRevealed(null);
                            try {
                                const blob = await fetchBlob(imageUrl);
                                const message = await decodeMessageFromImage(blob, passphrase);
                                if (!message) {
                                    setError('No hidden message found or passphrase is incorrect.');
                                } else {
                                    setRevealed(message);
                                }
                            } catch (err) {
                                setError(
                                    err instanceof Error
                                        ? err.message
                                        : 'Failed to decode hidden content.',
                                );
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading || !passphrase.trim()}
                    >
                        {loading ? 'Revealing…' : 'Reveal Message'}
                    </button>
                </div>

                {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
                {revealed ? (
                    <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{revealed}</pre>
                ) : null}
            </div>
        </details>
    );
};

export default RevealMessagePanel;
