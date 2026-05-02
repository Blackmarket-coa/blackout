import React, { type CSSProperties } from 'react';
import { sanitizeProfileThemeTokenValue, type ProfileCustomTheme, type ProfileThemeTokenKey } from './profileTypes';

export interface ProfileThemeEditorProps {
    theme?: ProfileCustomTheme;
    onChange: (next: ProfileCustomTheme | undefined) => void;
}

interface TokenField {
    key: ProfileThemeTokenKey;
    label: string;
    inputType: 'color' | 'text';
    placeholder?: string;
}

const FIELDS: TokenField[] = [
    { key: 'accent', label: 'Accent', inputType: 'color' },
    { key: 'panelBg', label: 'Panel background', inputType: 'color' },
    { key: 'panelFg', label: 'Panel text', inputType: 'color' },
    { key: 'headerBg', label: 'Header background', inputType: 'color' },
    { key: 'linkColor', label: 'Link color', inputType: 'color' },
    { key: 'fontFamily', label: 'Font family', inputType: 'text', placeholder: 'Inter, sans-serif' },
];

const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '160px 1fr auto',
    gap: 8,
    alignItems: 'center',
};

const previewStyle: CSSProperties = {
    width: 24,
    height: 24,
    border: '1px solid var(--border-default)',
    borderRadius: 6,
};

const inputStyle: CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
};

export function ProfileThemeEditor({ theme, onChange }: ProfileThemeEditorProps) {
    const tokens = theme?.tokens ?? {};

    const setToken = (key: ProfileThemeTokenKey, raw: string) => {
        const value = raw.trim();
        const next: Partial<Record<ProfileThemeTokenKey, string>> = { ...tokens };
        if (value.length === 0) {
            delete next[key];
        } else {
            const validated = sanitizeProfileThemeTokenValue(key, value);
            if (validated === null) return; // refuse invalid input silently
            next[key] = validated;
        }
        const allEmpty = Object.values(next).every((v) => v === undefined);
        onChange(allEmpty ? undefined : { tokens: next });
    };

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            data-testid="profile-theme-editor"
        >
            {FIELDS.map(({ key, label, inputType, placeholder }) => {
                const value = tokens[key] ?? '';
                return (
                    <label key={key} style={rowStyle}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                        <input
                            type={inputType}
                            value={value}
                            placeholder={placeholder}
                            onChange={(event) => setToken(key, event.target.value)}
                            style={inputStyle}
                        />
                        {inputType === 'color' && value ? (
                            <span style={{ ...previewStyle, background: value }} aria-hidden />
                        ) : (
                            <span style={{ width: 24 }} />
                        )}
                    </label>
                );
            })}
            <small style={{ color: 'var(--text-secondary)' }}>
                Constrained color and font tokens only. Raw CSS isn't accepted in v1.
            </small>
        </div>
    );
}

export default ProfileThemeEditor;
