import React, { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { uploadContent, mxcUrlToHttp } from '../../../utils/matrix';

/**
 * Preview-media uploader for the sell flow. Uploads image files to the Matrix
 * media repo (the same `uploadContent` path the composer uses) and collects the
 * resulting `mxc://` URIs into `mediaUrls`. These are *preview* images shown to
 * buyers — the sellable artifact bytes are a separate concern (delivered via the
 * marketplace's signed-bundle / dead-drop path), which the wizard states plainly.
 */
interface MediaUploadFieldProps {
    value: string[];
    onChange: (urls: string[]) => void;
    disabled?: boolean;
}

const listStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };
const thumbStyle: CSSProperties = {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #111827)',
};
const removeStyle: CSSProperties = {
    position: 'absolute',
    top: 2,
    right: 2,
    border: 'none',
    borderRadius: 999,
    width: 20,
    height: 20,
    lineHeight: '18px',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 12,
};

export const MediaUploadField: React.FC<MediaUploadFieldProps> = ({
    value,
    onChange,
    disabled,
}) => {
    const mx = useMatrixClientOrNull();
    const useAuthedMedia = useMediaAuthentication();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFiles = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            if (!mx) {
                setError('Media upload needs an active session.');
                return;
            }
            setBusy(true);
            setError(null);
            const uploaded: string[] = [];
            for (const file of Array.from(files)) {
                // eslint-disable-next-line no-await-in-loop
                await uploadContent(mx, file, {
                    name: file.name,
                    fileType: file.type,
                    onSuccess: (mxc) => uploaded.push(mxc),
                    onError: () => setError(`Could not upload ${file.name}.`),
                });
            }
            if (uploaded.length > 0) onChange([...value, ...uploaded]);
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        },
        [mx, onChange, value]
    );

    const removeAt = useCallback(
        (index: number) => {
            onChange(value.filter((_, i) => i !== index));
        },
        [onChange, value]
    );

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={disabled || busy || !mx}
                onChange={(e) => void handleFiles(e.target.files)}
                data-testid="media-upload-input"
            />
            {busy ? (
                <small style={{ color: 'var(--text-secondary, #aaa)', marginLeft: 8 }}>
                    Uploading…
                </small>
            ) : null}
            {error ? (
                <small style={{ color: 'var(--danger, #b3261e)', display: 'block', marginTop: 4 }}>
                    {error}
                </small>
            ) : null}
            {value.length > 0 ? (
                <div style={listStyle}>
                    {value.map((mxc, index) => {
                        const src = mx ? mxcUrlToHttp(mx, mxc, useAuthedMedia) : null;
                        return (
                            <div key={`${mxc}-${index}`} style={thumbStyle}>
                                {src ? (
                                    <img
                                        src={src}
                                        alt="preview"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                        }}
                                    />
                                ) : (
                                    <span
                                        style={{ fontSize: 10, padding: 4, wordBreak: 'break-all' }}
                                    >
                                        {mxc}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    style={removeStyle}
                                    onClick={() => removeAt(index)}
                                    aria-label="Remove image"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};

export default MediaUploadField;
