import { useMemo, useState } from 'react';
import { decodeMessageFromImage } from './SteganographyDecoder';
import { encodeMessageInImage, getSteganographyCapacity } from './SteganographyEncoder';

interface HideMessageDialogProps {
    open: boolean;
    onClose: () => void;
    onEncoded: (file: File) => void;
}

type StegoPanel = 'encode' | 'decrypt' | 'password';

const panelButtonStyle = (active: boolean): Record<string, string | number> => ({
    border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
    background: active ? 'var(--bg-muted)' : 'transparent',
    color: 'var(--text-primary)',
    borderRadius: 999,
    padding: '4px 10px',
    cursor: 'pointer',
});

const generatePassphrase = (length: number): string => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-?';
    const randomValues = crypto.getRandomValues(new Uint32Array(length));
    return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
};

export const HideMessageDialog = ({ open, onClose, onEncoded }: HideMessageDialogProps) => {
    const [activePanel, setActivePanel] = useState<StegoPanel>('encode');
    const [sourceImage, setSourceImage] = useState<File | null>(null);
    const [message, setMessage] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [encoding, setEncoding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [maxLength, setMaxLength] = useState<number | null>(null);

    const [decodeImage, setDecodeImage] = useState<File | null>(null);
    const [decodePassphrase, setDecodePassphrase] = useState('');
    const [decodedMessage, setDecodedMessage] = useState<string | null>(null);
    const [decoding, setDecoding] = useState(false);
    const [decodeError, setDecodeError] = useState<string | null>(null);

    const [generatedPassphrase, setGeneratedPassphrase] = useState(() => generatePassphrase(24));

    const disabled = useMemo(
        () => !sourceImage || !message.trim() || !passphrase.trim() || encoding,
        [encoding, message, passphrase, sourceImage],
    );

    if (!open) return null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40 }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 560,
                    maxWidth: '92vw',
                    margin: '10vh auto',
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <h3 style={{ marginTop: 0 }}>Steganography Toolbox</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Select an action: hide, decrypt, or create a strong passphrase for stego
                    messages.
                </p>

                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        style={panelButtonStyle(activePanel === 'encode')}
                        onClick={() => setActivePanel('encode')}
                    >
                        Hide Message
                    </button>
                    <button
                        type="button"
                        style={panelButtonStyle(activePanel === 'decrypt')}
                        onClick={() => setActivePanel('decrypt')}
                    >
                        Decrypt Image
                    </button>
                    <button
                        type="button"
                        style={panelButtonStyle(activePanel === 'password')}
                        onClick={() => setActivePanel('password')}
                    >
                        Create Password
                    </button>
                </div>

                {activePanel === 'encode' ? (
                    <>
                        <label style={{ display: 'grid', gap: 4 }}>
                            Select image (PNG/JPEG)
                            <input
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={async (event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    setSourceImage(file);
                                    setError(null);
                                    if (!file) {
                                        setMaxLength(null);
                                        return;
                                    }

                                    try {
                                        const capacity = await getSteganographyCapacity(file);
                                        setMaxLength(capacity.maxMessageLength);
                                    } catch (err) {
                                        setError(
                                            err instanceof Error
                                                ? err.message
                                                : 'Failed to inspect image capacity.',
                                        );
                                        setMaxLength(null);
                                    }
                                }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                            Hidden message
                            <textarea
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                maxLength={maxLength ?? undefined}
                                rows={5}
                                placeholder="Enter secret message..."
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                            Passphrase
                            <input
                                type="password"
                                value={passphrase}
                                onChange={(event) => setPassphrase(event.target.value)}
                            />
                        </label>

                        {maxLength !== null ? (
                            <small>
                                Maximum message length for this image: {maxLength} chars (approx).
                            </small>
                        ) : null}
                        {error ? <div style={{ color: 'var(--danger)' }}>{error}</div> : null}

                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginTop: 12,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setPassphrase(generatePassphrase(24))}
                            >
                                Create passphrase
                            </button>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={onClose}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={async () => {
                                        if (!sourceImage) return;
                                        setEncoding(true);
                                        setError(null);
                                        try {
                                            const encoded = await encodeMessageInImage(
                                                message,
                                                sourceImage,
                                                passphrase,
                                            );
                                            onEncoded(encoded.file);
                                            setSourceImage(null);
                                            setMessage('');
                                            setPassphrase('');
                                            onClose();
                                        } catch (err) {
                                            setError(
                                                err instanceof Error
                                                    ? err.message
                                                    : 'Failed to encode hidden message.',
                                            );
                                        } finally {
                                            setEncoding(false);
                                        }
                                    }}
                                >
                                    {encoding ? 'Encoding…' : 'Encode & Attach'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : null}

                {activePanel === 'decrypt' ? (
                    <>
                        <label style={{ display: 'grid', gap: 4 }}>
                            Select encoded image (PNG/JPEG)
                            <input
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={(event) => {
                                    setDecodeImage(event.target.files?.[0] ?? null);
                                    setDecodedMessage(null);
                                    setDecodeError(null);
                                }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                            Passphrase
                            <input
                                type="password"
                                value={decodePassphrase}
                                onChange={(event) => setDecodePassphrase(event.target.value)}
                            />
                        </label>

                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 8,
                                marginTop: 12,
                            }}
                        >
                            <button type="button" onClick={onClose}>
                                Close
                            </button>
                            <button
                                type="button"
                                disabled={decoding || !decodeImage || !decodePassphrase.trim()}
                                onClick={async () => {
                                    if (!decodeImage) return;
                                    setDecoding(true);
                                    setDecodeError(null);
                                    setDecodedMessage(null);
                                    try {
                                        const decoded = await decodeMessageFromImage(
                                            decodeImage,
                                            decodePassphrase,
                                        );
                                        if (!decoded) {
                                            setDecodeError(
                                                'No hidden message found or passphrase is incorrect.',
                                            );
                                            return;
                                        }
                                        setDecodedMessage(decoded);
                                    } catch (err) {
                                        setDecodeError(
                                            err instanceof Error
                                                ? err.message
                                                : 'Failed to decode hidden content.',
                                        );
                                    } finally {
                                        setDecoding(false);
                                    }
                                }}
                            >
                                {decoding ? 'Decrypting…' : 'Decrypt'}
                            </button>
                        </div>

                        {decodeError ? (
                            <p style={{ color: 'var(--danger)' }}>{decodeError}</p>
                        ) : null}
                        {decodedMessage ? (
                            <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                                {decodedMessage}
                            </pre>
                        ) : null}
                    </>
                ) : null}

                {activePanel === 'password' ? (
                    <>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                            Generate a random passphrase and reuse it in Hide/Decrypt.
                        </p>
                        <label style={{ display: 'grid', gap: 4 }}>
                            Suggested passphrase
                            <input value={generatedPassphrase} readOnly />
                        </label>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginTop: 12,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setGeneratedPassphrase(generatePassphrase(24))}
                            >
                                Generate new
                            </button>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!navigator.clipboard?.writeText) return;
                                        await navigator.clipboard.writeText(generatedPassphrase);
                                    }}
                                >
                                    Copy
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPassphrase(generatedPassphrase);
                                        setDecodePassphrase(generatedPassphrase);
                                        setActivePanel('encode');
                                    }}
                                >
                                    Use for hide
                                </button>
                                <button type="button" onClick={onClose}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
};

export default HideMessageDialog;
