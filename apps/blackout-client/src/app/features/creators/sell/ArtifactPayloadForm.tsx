import React, { useCallback, useRef, useState, type CSSProperties } from 'react';
import type { ArtifactFile, ArtifactFormDescriptor } from './artifactFormRegistry';

/**
 * Renders the per-field inputs for one `ArtifactFormDescriptor` and reports value
 * changes to the parent wizard. Field help text is the in-product "help creating
 * blackout products"; the same shapes are documented in
 * `docs/guides/creating-blackout-products.md`.
 */
interface ArtifactPayloadFormProps {
    descriptor: ArtifactFormDescriptor;
    values: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

/** Cap inline artifact bytes so we don't build an unbounded base64 payload. */
const MAX_ARTIFACT_FILE_BYTES = 5 * 1024 * 1024;

const labelStyle: CSSProperties = { display: 'grid', gap: 4 };
const labelTextStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary, #aaa)' };
const helpStyle: CSSProperties = { fontSize: 11, color: 'var(--text-muted, #888)' };
const inputStyle: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    width: '100%',
};

function fileToArtifactFile(file: File): Promise<ArtifactFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result);
            const comma = result.indexOf(',');
            resolve({
                name: file.name,
                mime: file.type || 'application/octet-stream',
                base64: comma >= 0 ? result.slice(comma + 1) : result,
            });
        };
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(file);
    });
}

const FileListControl: React.FC<{
    files: ArtifactFile[];
    onChange: (files: ArtifactFile[]) => void;
}> = ({ files, onChange }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState<string | null>(null);

    const addFiles = useCallback(
        async (list: FileList | null) => {
            if (!list || list.length === 0) return;
            setError(null);
            const next: ArtifactFile[] = [];
            for (const file of Array.from(list)) {
                if (file.size > MAX_ARTIFACT_FILE_BYTES) {
                    setError(`${file.name} is larger than 5 MB and was skipped.`);
                    continue;
                }
                // eslint-disable-next-line no-await-in-loop
                next.push(await fileToArtifactFile(file));
            }
            if (next.length > 0) onChange([...files, ...next]);
            if (inputRef.current) inputRef.current.value = '';
        },
        [files, onChange]
    );

    return (
        <div style={{ display: 'grid', gap: 6 }}>
            <input
                ref={inputRef}
                type="file"
                multiple
                onChange={(e) => void addFiles(e.target.files)}
                data-testid="artifact-file-input"
            />
            {error ? <small style={{ color: 'var(--danger, #b3261e)' }}>{error}</small> : null}
            {files.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {files.map((f, index) => (
                        <li key={`${f.name}-${index}`}>
                            {f.name} <span style={helpStyle}>({f.mime})</span>{' '}
                            <button
                                type="button"
                                onClick={() => onChange(files.filter((_, i) => i !== index))}
                                style={{ fontSize: 11 }}
                            >
                                remove
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};

function asDisplayString(value: unknown): string {
    if (Array.isArray(value)) return value.join(', ');
    if (value === undefined || value === null) return '';
    return String(value);
}

export const ArtifactPayloadForm: React.FC<ArtifactPayloadFormProps> = ({
    descriptor,
    values,
    onChange,
}) => {
    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {descriptor.notes ? (
                <p style={{ ...helpStyle, margin: 0 }}>{descriptor.notes}</p>
            ) : null}
            {descriptor.fields.map((field) => {
                const value = values[field.key];
                const common = {
                    id: `artifact-${field.key}`,
                    style: inputStyle,
                    'data-testid': `artifact-field-${field.key}`,
                };
                return (
                    <label key={field.key} style={labelStyle} htmlFor={common.id}>
                        <span style={labelTextStyle}>
                            {field.label}
                            {field.required ? ' *' : ''}
                        </span>
                        <span style={helpStyle}>{field.help}</span>
                        {field.control === 'text' && (
                            <input
                                {...common}
                                type="text"
                                value={asDisplayString(value)}
                                placeholder={field.placeholder}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                        {field.control === 'number' && (
                            <input
                                {...common}
                                type="number"
                                value={asDisplayString(value)}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                        {field.control === 'textarea' && (
                            <textarea
                                {...common}
                                rows={3}
                                value={asDisplayString(value)}
                                placeholder={field.placeholder}
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                        {field.control === 'tags' && (
                            <input
                                {...common}
                                type="text"
                                value={asDisplayString(value)}
                                placeholder={field.placeholder}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                        {field.control === 'select' && (
                            <select
                                {...common}
                                value={asDisplayString(value)}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            >
                                {(field.options ?? []).map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        )}
                        {field.control === 'json' && (
                            <textarea
                                {...common}
                                rows={6}
                                value={asDisplayString(value)}
                                placeholder={field.placeholder}
                                style={{
                                    ...inputStyle,
                                    resize: 'vertical',
                                    fontFamily: 'monospace',
                                }}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        )}
                        {field.control === 'file-list' && (
                            <FileListControl
                                files={Array.isArray(value) ? (value as ArtifactFile[]) : []}
                                onChange={(files) => onChange(field.key, files)}
                            />
                        )}
                    </label>
                );
            })}
        </div>
    );
};

export default ArtifactPayloadForm;
