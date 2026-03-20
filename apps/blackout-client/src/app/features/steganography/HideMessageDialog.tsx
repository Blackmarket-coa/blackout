import { useMemo, useState } from 'react';
import { encodeMessageInImage, getSteganographyCapacity } from './SteganographyEncoder';

interface HideMessageDialogProps {
  open: boolean;
  onClose: () => void;
  onEncoded: (file: File) => void;
}

export const HideMessageDialog = ({ open, onClose, onEncoded }: HideMessageDialogProps) => {
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [encoding, setEncoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxLength, setMaxLength] = useState<number | null>(null);

  const disabled = useMemo(() => !sourceImage || !message.trim() || !passphrase.trim() || encoding, [encoding, message, passphrase, sourceImage]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40 }} onClick={onClose}>
      <div
        style={{ width: 520, maxWidth: '92vw', margin: '10vh auto', padding: 12, borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Hide Message in Image</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Tier feature ($4.99/mo): embeds encrypted hidden content using LSB steganography.</p>

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
                setError(err instanceof Error ? err.message : 'Failed to inspect image capacity.');
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
          <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
        </label>

        {maxLength !== null ? <small>Maximum message length for this image: {maxLength} chars (approx).</small> : null}
        {error ? <div style={{ color: 'var(--danger)' }}>{error}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              if (!sourceImage) return;
              setEncoding(true);
              setError(null);
              try {
                const encoded = await encodeMessageInImage(message, sourceImage, passphrase);
                onEncoded(encoded.file);
                setSourceImage(null);
                setMessage('');
                setPassphrase('');
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to encode hidden message.');
              } finally {
                setEncoding(false);
              }
            }}
          >
            {encoding ? 'Encoding…' : 'Encode & Attach'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HideMessageDialog;
