import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    computeStegoExpiryAt,
    normalizeStegoChannelId,
    type CreateStegoChannelInput,
    type StegoCarrier,
    type StegoChannelSnapshot,
    type StegoEphemeralMode,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type StegoToolkitFetcher = {
    listChannels: () => Promise<{ subject?: string; channels: StegoChannelSnapshot[] }>;
    createChannel: (input: CreateStegoChannelInput) => Promise<unknown>;
};

type StegoToolkitPageProps = {
    /**
     * Optional fetcher injection — defaults to a no-op stub that returns
     * an empty channel list. Production callers wire the real
     * `createStegoActions(client)` here once the canonical SDK client is
     * available; tests inject a mock.
     */
    fetcher?: StegoToolkitFetcher;
};

const CARRIERS: StegoCarrier[] = ['text', 'image', 'audio'];
const EPHEMERAL_MODES: StegoEphemeralMode[] = [
    'persistent',
    'expire_after_hours',
    'delete_on_read',
];

const formatExpiry = (channel: StegoChannelSnapshot): string => {
    if (channel.expiredAt) return `Expired (${channel.expiryReason ?? 'unknown'})`;
    const next = computeStegoExpiryAt(channel);
    if (!next) {
        return channel.ephemeralMode === 'delete_on_read' ? 'Delete on read' : 'Persistent';
    }
    return `Auto-expires ${next}`;
};

const stubFetcher: StegoToolkitFetcher = {
    listChannels: async () => ({ channels: [] }),
    createChannel: async () => ({}),
};

export function StegoToolkitPage({ fetcher: explicitFetcher }: StegoToolkitPageProps) {
    const contextFetcher = useRegistryFetcher('stegoToolkit');
    const fetcher = explicitFetcher ?? contextFetcher ?? stubFetcher;
    const [channels, setChannels] = useState<StegoChannelSnapshot[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [audience, setAudience] = useState('General');
    const [carrier, setCarrier] = useState<StegoCarrier>('image');
    const [ephemeralMode, setEphemeralMode] = useState<StegoEphemeralMode>('persistent');
    const [ttlHours, setTtlHours] = useState(24);
    const [rotationDays, setRotationDays] = useState(14);
    const [passphrase, setPassphrase] = useState('');

    const previewId = useMemo(() => normalizeStegoChannelId(name), [name]);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.listChannels();
            setChannels(response.channels ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load channels.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setSubmitError(null);
            if (!name.trim() || !passphrase.trim()) {
                setSubmitError('Name and passphrase are required.');
                return;
            }
            const input: CreateStegoChannelInput = {
                name: name.trim(),
                audience: audience.trim() || 'General',
                carrier,
                ephemeralMode,
                rotationDays: Math.max(0, rotationDays | 0),
                passphrase: passphrase.trim(),
                ...(ephemeralMode === 'expire_after_hours'
                    ? { ttlHours: Math.max(1, ttlHours | 0) }
                    : {}),
            };
            setPending(true);
            try {
                await fetcher.createChannel(input);
                setName('');
                setPassphrase('');
                await refresh();
            } catch (error) {
                setSubmitError(error instanceof Error ? error.message : 'Failed to create channel.');
            } finally {
                setPending(false);
            }
        },
        [audience, carrier, ephemeralMode, fetcher, name, passphrase, refresh, rotationDays, ttlHours]
    );

    return (
        <main data-testid="stego-toolkit-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Stego Toolkit</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Manage steganography channels — list, create, rotate, and revoke. Backed by
                    the BKL-005 stego SDK.
                </p>
            </header>

            <section
                data-testid="stego-toolkit-channel-list"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Channels</strong>
                    <button type="button" onClick={() => void refresh()}>
                        Refresh
                    </button>
                </header>
                {loadError ? (
                    <p data-testid="stego-toolkit-load-error" role="alert">
                        {loadError}
                    </p>
                ) : null}
                {channels.length === 0 ? (
                    <p data-testid="stego-toolkit-empty" style={{ color: 'var(--text-secondary)' }}>
                        No channels yet. Create one below.
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                        {channels.map((channel) => (
                            <li
                                key={channel.channelId}
                                data-testid={`stego-channel-${channel.channelId}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    padding: 8,
                                    display: 'grid',
                                    gap: 4,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>{channel.name}</strong>
                                    <small>{channel.carrier}</small>
                                </div>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    Audience: {channel.audience} · Rotation:{' '}
                                    {channel.rotationDays || 0}d · {formatExpiry(channel)}
                                </small>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <form
                data-testid="stego-toolkit-create-form"
                onSubmit={onSubmit}
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <strong>Create channel</strong>
                <label style={{ display: 'grid', gap: 4 }}>
                    Name
                    <input
                        data-testid="stego-toolkit-create-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="e.g. broadcast"
                        required
                    />
                    {previewId ? (
                        <small data-testid="stego-toolkit-create-id-preview">
                            id preview: <code>{previewId}</code>
                        </small>
                    ) : null}
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                    Audience
                    <input
                        data-testid="stego-toolkit-create-audience"
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                    />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                    Carrier
                    <select
                        data-testid="stego-toolkit-create-carrier"
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value as StegoCarrier)}
                    >
                        {CARRIERS.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                    Ephemeral mode
                    <select
                        data-testid="stego-toolkit-create-mode"
                        value={ephemeralMode}
                        onChange={(event) =>
                            setEphemeralMode(event.target.value as StegoEphemeralMode)
                        }
                    >
                        {EPHEMERAL_MODES.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </label>
                {ephemeralMode === 'expire_after_hours' ? (
                    <label style={{ display: 'grid', gap: 4 }}>
                        TTL hours
                        <input
                            data-testid="stego-toolkit-create-ttl"
                            type="number"
                            min={1}
                            max={168}
                            value={ttlHours}
                            onChange={(event) =>
                                setTtlHours(Number.parseInt(event.target.value, 10) || 1)
                            }
                        />
                    </label>
                ) : null}
                <label style={{ display: 'grid', gap: 4 }}>
                    Rotation days
                    <input
                        data-testid="stego-toolkit-create-rotation"
                        type="number"
                        min={0}
                        max={365}
                        value={rotationDays}
                        onChange={(event) =>
                            setRotationDays(Number.parseInt(event.target.value, 10) || 0)
                        }
                    />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                    Passphrase
                    <input
                        data-testid="stego-toolkit-create-passphrase"
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                        required
                    />
                </label>
                {submitError ? (
                    <p data-testid="stego-toolkit-create-error" role="alert">
                        {submitError}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="stego-toolkit-create-submit"
                    disabled={pending}
                >
                    {pending ? 'Creating…' : 'Create channel'}
                </button>
            </form>
        </main>
    );
}

export default StegoToolkitPage;
