import { useEffect, useState, type FormEvent } from 'react';
import {
    fieldStyle,
    inputStyle,
    primaryButtonStyle,
    secondaryButtonStyle,
    errorTextStyle,
} from './styles';
import { loadClientConfig, resolveHomeserver } from './homeserver';
import { readSavedHomeservers } from '../../../state/matrixServers';
import type { ResolvedHomeserver } from './types';

type ServerPickerProps = {
    server: ResolvedHomeserver;
    onChange: (next: ResolvedHomeserver) => void;
};

/**
 * Inline server picker — single-line summary with a "Change" button that
 * expands the editor. Mirrors Cinny's compact homeserver row.
 */
export const ServerPicker = ({ server, onChange }: ServerPickerProps) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(server.rawInput);
    const [presets, setPresets] = useState<string[]>([]);
    const [allowCustom, setAllowCustom] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void loadClientConfig().then((cfg) => {
            if (cancelled) return;
            const configHosts = cfg.homeserverList ?? [];
            const savedHosts = readSavedHomeservers().map((server) => server.serverName);
            setPresets([...new Set([...configHosts, ...savedHosts])]);
            setAllowCustom(cfg.allowCustomHomeservers !== false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setDraft(server.rawInput);
    }, [server.rawInput]);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setResolving(true);
        try {
            const next = await resolveHomeserver(draft);
            onChange(next);
            setEditing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not connect to homeserver.');
        } finally {
            setResolving(false);
        }
    };

    if (!editing) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text-secondary, #94a3b8)',
                }}
            >
                <span>
                    Homeserver:{' '}
                    <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>
                        {server.serverName}
                    </strong>
                </span>
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent, #60a5fa)',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                        fontSize: 13,
                    }}
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
            <label style={fieldStyle}>
                <span>Homeserver</span>
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    list={presets.length > 0 ? 'homeserver-presets' : undefined}
                    placeholder="matrix.theblackout.app"
                    style={inputStyle}
                    autoFocus
                    disabled={!allowCustom}
                    required
                />
                {presets.length > 0 ? (
                    <datalist id="homeserver-presets">
                        {presets.map((host) => (
                            <option key={host} value={host} />
                        ))}
                    </datalist>
                ) : null}
            </label>
            {error ? (
                <p role="alert" style={errorTextStyle}>
                    {error}
                </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={primaryButtonStyle} disabled={resolving}>
                    {resolving ? 'Connecting…' : 'Connect'}
                </button>
                <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => {
                        setDraft(server.rawInput);
                        setError(null);
                        setEditing(false);
                    }}
                >
                    Cancel
                </button>
            </div>
            {!allowCustom ? (
                <p style={{ ...errorTextStyle, color: 'var(--text-secondary, #94a3b8)' }}>
                    Custom homeservers are disabled by your operator.
                </p>
            ) : null}
        </form>
    );
};
