import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    computeStegoExpiryAt,
    type RotateStegoChannelInput,
    type StegoChannelExpiryReason,
    type StegoChannelSnapshot,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type StegoLifecycleFetcher = {
    listChannels: () => Promise<{ channels: StegoChannelSnapshot[] }>;
    rotateChannel: (channelId: string, input: RotateStegoChannelInput) => Promise<unknown>;
    expireChannel: (
        channelId: string,
        options?: { reason?: StegoChannelExpiryReason }
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: StegoLifecycleFetcher;
};

const stub: StegoLifecycleFetcher = {
    listChannels: async () => ({ channels: [] }),
    rotateChannel: async () => ({}),
    expireChannel: async () => ({}),
};

const EXPIRY_REASONS: StegoChannelExpiryReason[] = [
    'operator_revoked',
    'policy_archived',
    'ttl_elapsed',
    'read_consumed',
];

const formatExpirySummary = (channel: StegoChannelSnapshot): string => {
    if (channel.expiredAt) {
        return `Expired ${channel.expiredAt} (${channel.expiryReason ?? 'unknown'})`;
    }
    const next = computeStegoExpiryAt(channel);
    if (!next) {
        return channel.ephemeralMode === 'delete_on_read'
            ? 'Delete on read'
            : 'Persistent';
    }
    return `Auto-expires ${next}`;
};

export function StegoLifecyclePage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('stegoLifecycle');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [channels, setChannels] = useState<StegoChannelSnapshot[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const [passphrase, setPassphrase] = useState<Record<string, string>>({});
    const [reason, setReason] = useState<Record<string, StegoChannelExpiryReason>>({});

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

    const onRotate = useCallback(
        async (channelId: string) => {
            const pass = passphrase[channelId]?.trim();
            if (!pass) {
                setActionError(`Rotate aborted: passphrase required for ${channelId}.`);
                return;
            }
            setActionError(null);
            setPendingId(channelId);
            try {
                await fetcher.rotateChannel(channelId, { passphrase: pass });
                setPassphrase((prev) => ({ ...prev, [channelId]: '' }));
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Rotate failed for ${channelId}.`
                );
            } finally {
                setPendingId(null);
            }
        },
        [fetcher, passphrase, refresh]
    );

    const onExpire = useCallback(
        async (channelId: string) => {
            setActionError(null);
            setPendingId(channelId);
            try {
                await fetcher.expireChannel(channelId, {
                    reason: reason[channelId] ?? 'operator_revoked',
                });
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Expire failed for ${channelId}.`
                );
            } finally {
                setPendingId(null);
            }
        },
        [fetcher, reason, refresh]
    );

    const activeChannels = useMemo(
        () => channels.filter((channel) => !channel.expiredAt),
        [channels]
    );

    return (
        <main
            data-testid="stego-lifecycle-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Ephemeral Stego Lifecycle</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Rotate or expire active channels. Backed by `rotateChannel` /
                    `expireChannel` and the BKL-005 lifecycle envelopes.
                </p>
            </header>

            {loadError ? (
                <p data-testid="stego-lifecycle-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}

            {actionError ? (
                <p data-testid="stego-lifecycle-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {activeChannels.length === 0 ? (
                <p data-testid="stego-lifecycle-empty" style={{ color: 'var(--text-secondary)' }}>
                    No active channels. Create one in the toolkit first.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {activeChannels.map((channel) => {
                        const isPending = pendingId === channel.channelId;
                        return (
                            <li
                                key={channel.channelId}
                                data-testid={`stego-lifecycle-row-${channel.channelId}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    padding: 10,
                                    display: 'grid',
                                    gap: 6,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>{channel.name}</strong>
                                    <small>
                                        rotation #{channel.rotationIndex} · {channel.carrier}
                                    </small>
                                </div>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {formatExpirySummary(channel)}
                                </small>
                                <div style={{ display: 'grid', gap: 4 }}>
                                    <label>
                                        New passphrase
                                        <input
                                            data-testid={`stego-lifecycle-passphrase-${channel.channelId}`}
                                            type="password"
                                            value={passphrase[channel.channelId] ?? ''}
                                            onChange={(event) =>
                                                setPassphrase((prev) => ({
                                                    ...prev,
                                                    [channel.channelId]: event.target.value,
                                                }))
                                            }
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        data-testid={`stego-lifecycle-rotate-${channel.channelId}`}
                                        onClick={() => void onRotate(channel.channelId)}
                                        disabled={isPending}
                                    >
                                        {isPending ? 'Rotating…' : 'Rotate keys'}
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gap: 4 }}>
                                    <label>
                                        Expiry reason
                                        <select
                                            data-testid={`stego-lifecycle-reason-${channel.channelId}`}
                                            value={reason[channel.channelId] ?? 'operator_revoked'}
                                            onChange={(event) =>
                                                setReason((prev) => ({
                                                    ...prev,
                                                    [channel.channelId]: event.target
                                                        .value as StegoChannelExpiryReason,
                                                }))
                                            }
                                        >
                                            {EXPIRY_REASONS.map((value) => (
                                                <option key={value} value={value}>
                                                    {value}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        type="button"
                                        data-testid={`stego-lifecycle-expire-${channel.channelId}`}
                                        onClick={() => void onExpire(channel.channelId)}
                                        disabled={isPending}
                                    >
                                        {isPending ? 'Expiring…' : 'Expire channel'}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}

export default StegoLifecyclePage;
