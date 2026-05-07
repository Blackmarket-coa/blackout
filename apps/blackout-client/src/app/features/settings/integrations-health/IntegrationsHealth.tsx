import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useAlive } from '../../../hooks/useAlive';
import {
    fetchIntegrationsHealth,
    type IntegrationsHealthSnapshot,
    type LinkedAccountHealth,
    type TwitchChatBridgeHealth,
} from './integrationsHealthClient';

/**
 * Settings panel that polls /v1/integrations/health every ~10s and renders
 * a single-pane self-diagnose dashboard for the creator: linked-account
 * expiry warnings, Twitch chat ingress runtime state, YouTube bridges,
 * EventSub subscription statuses, widget tokens, Patreon/Streamlabs
 * webhook + scheduler config.
 *
 * Read-only for v1. Direct-action buttons (re-link expired account,
 * resume bridge, etc.) live in the per-feature panels above this one.
 */

const POLL_INTERVAL_MS = 10_000;

interface IntegrationsHealthProps {
    apiClient?: Parameters<typeof fetchIntegrationsHealth>[0];
    /** Override poll interval (ms). Tests use 0 to disable the timer. */
    pollIntervalMs?: number;
}

const formatRelative = (iso?: string, nowMs?: number): string => {
    if (!iso) return 'never';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    const now = nowMs ?? Date.now();
    const deltaSec = Math.floor((now - t) / 1000);
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
    if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
    return new Date(t).toLocaleDateString();
};

const expiryBadge = (link: LinkedAccountHealth): string => {
    if (link.isExpired) return 'expired';
    if (link.expiresInSeconds !== undefined && link.expiresInSeconds < 5 * 60) {
        return `expires in ${Math.max(0, link.expiresInSeconds)}s`;
    }
    if (link.expiresAt) {
        return `expires ${new Date(link.expiresAt).toLocaleString()}`;
    }
    return 'no expiry';
};

const bridgeStateBadge = (bridge: TwitchChatBridgeHealth): string => {
    if (!bridge.isActive) {
        return bridge.lastStoppedReason
            ? `inactive (${bridge.lastStoppedReason})`
            : 'inactive';
    }
    if (!bridge.ingressState) return 'no live session';
    return bridge.ingressState;
};

export function IntegrationsHealth({
    apiClient: testApiClient,
    pollIntervalMs = POLL_INTERVAL_MS,
}: IntegrationsHealthProps = {}) {
    const alive = useAlive();
    const [snapshot, setSnapshot] = useState<IntegrationsHealthSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = await fetchIntegrationsHealth(testApiClient);
            if (alive()) {
                setSnapshot(next);
                setError(null);
            }
        } catch (err) {
            if (alive()) setError((err as Error).message);
        } finally {
            if (alive()) setRefreshing(false);
        }
    }, [alive, testApiClient]);

    useEffect(() => {
        void refresh();
        if (pollIntervalMs > 0) {
            intervalRef.current = setInterval(() => {
                void refresh();
            }, pollIntervalMs);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [pollIntervalMs, refresh]);

    const nowMs = snapshot?.generatedAtMs ?? Date.now();

    return (
        <Box direction="Column" gap="200">
            <Box gap="200" alignItems="Center">
                <Text size="L400">Integrations health</Text>
                {refreshing && <Spinner size="200" />}
                <Box grow="Yes" />
                <Button
                    size="300"
                    variant="Secondary"
                    fill="None"
                    radii="Pill"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    data-testid="integrations-health-refresh"
                >
                    <Text size="B300">Refresh</Text>
                </Button>
            </Box>
            <Text size="T200" priority="300">
                Live snapshot of every integration's runtime + persisted state. Polls every{' '}
                {Math.round(pollIntervalMs / 1000)} s. Use this to confirm chat is flowing,
                tokens are valid, and overlays are receiving alerts before raising a ticket.
            </Text>

            {error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load integrations health: {error}
                </Text>
            )}
            {!snapshot && !error && (
                <Box gap="200" alignItems="Center">
                    <Spinner size="200" />
                    <Text size="T200">Loading…</Text>
                </Box>
            )}

            {snapshot && (
                <Box direction="Column" gap="200">
                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Linked accounts</Text>}
                            description={`${snapshot.linkedAccounts.length} link${snapshot.linkedAccounts.length === 1 ? '' : 's'}`}
                        />
                        {snapshot.linkedAccounts.length === 0 && (
                            <Text size="T200" priority="300">
                                No linked accounts. Use the "Linked accounts" panel above to add one.
                            </Text>
                        )}
                        {snapshot.linkedAccounts.map((link) => (
                            <Box key={`${link.provider}-${link.providerUsername ?? 'na'}`} gap="200" alignItems="Center">
                                <Text size="T300">{link.provider}</Text>
                                <Text size="T200" priority="300">
                                    {link.providerUsername ?? '(no username)'}
                                </Text>
                                <Box grow="Yes" />
                                <Text
                                    size="T200"
                                    style={{
                                        color: link.isExpired ? 'var(--mx-color-critical, #c00)' : undefined,
                                    }}
                                >
                                    {expiryBadge(link)}
                                </Text>
                                {!link.hasRefreshToken && (
                                    <Text size="T200" priority="300">
                                        (no refresh token)
                                    </Text>
                                )}
                            </Box>
                        ))}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Twitch chat bridges</Text>}
                            description={`${snapshot.twitchChatBridges.length} bridge${snapshot.twitchChatBridges.length === 1 ? '' : 's'}`}
                        />
                        {snapshot.twitchChatBridges.map((bridge) => (
                            <Box key={bridge.id} direction="Column" gap="100">
                                <Box gap="200" alignItems="Center">
                                    <Text size="T300">#{bridge.twitchChannel}</Text>
                                    <Text size="T200" priority="300">
                                        → {bridge.matrixRoomId}
                                    </Text>
                                    <Box grow="Yes" />
                                    <Text size="T200">{bridgeStateBadge(bridge)}</Text>
                                </Box>
                                <Text size="T200" priority="300">
                                    forwarded {bridge.messagesForwarded ?? 0} · reconnects{' '}
                                    {bridge.reconnectAttempts ?? 0} · last frame{' '}
                                    {formatRelative(bridge.lastEventAt, nowMs)}
                                </Text>
                            </Box>
                        ))}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">YouTube chat bridges</Text>}
                            description={`${snapshot.youtubeChatBridges.length} bridge${snapshot.youtubeChatBridges.length === 1 ? '' : 's'} · scheduler ${snapshot.schedulers.youtubeChatRunning ? 'running' : 'stopped'}`}
                        />
                        {snapshot.youtubeChatBridges.map((bridge) => (
                            <Box key={bridge.id} gap="200" alignItems="Center">
                                <Text size="T300">{bridge.youtubeChannelId}</Text>
                                <Text size="T200" priority="300">
                                    → {bridge.matrixRoomId}
                                </Text>
                                <Box grow="Yes" />
                                <Text size="T200">{bridge.isActive ? 'active' : 'inactive'}</Text>
                            </Box>
                        ))}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Twitch EventSub subscriptions</Text>}
                            description={`${snapshot.twitchEventSubscriptions.length} subscription${snapshot.twitchEventSubscriptions.length === 1 ? '' : 's'}`}
                        />
                        {snapshot.twitchEventSubscriptions.map((sub) => (
                            <Box key={sub.helixSubscriptionId} gap="200" alignItems="Center">
                                <Text size="T300">{sub.type}</Text>
                                <Text size="T200" priority="300">
                                    broadcaster {sub.twitchUserId}
                                </Text>
                                <Box grow="Yes" />
                                <Text
                                    size="T200"
                                    style={{
                                        color:
                                            sub.status !== 'enabled'
                                                ? 'var(--mx-color-critical, #c00)'
                                                : undefined,
                                    }}
                                >
                                    {sub.status}
                                </Text>
                            </Box>
                        ))}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Widget alert tokens</Text>}
                            description={`${snapshot.widgetAlertTokens.length} token${snapshot.widgetAlertTokens.length === 1 ? '' : 's'}`}
                        />
                        {snapshot.widgetAlertTokens.map((token) => (
                            <Box key={token.id} gap="200" alignItems="Center">
                                <Text size="T300">{token.label ?? token.id.slice(0, 8)}</Text>
                                <Box grow="Yes" />
                                <Text size="T200" priority="300">
                                    last delivery {formatRelative(token.lastDeliveredAt, nowMs)}
                                </Text>
                                {token.revokedAt && (
                                    <Text
                                        size="T200"
                                        style={{ color: 'var(--mx-color-critical, #c00)' }}
                                    >
                                        revoked
                                    </Text>
                                )}
                            </Box>
                        ))}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Patreon</Text>}
                            description={
                                <>
                                    Linked: <strong>{snapshot.patreon.linked ? 'yes' : 'no'}</strong>{' '}
                                    · Webhook secret on server:{' '}
                                    <strong>
                                        {snapshot.patreon.webhookSecretConfigured ? 'configured' : 'not set'}
                                    </strong>
                                </>
                            }
                        />
                        {snapshot.patreon.linked && !snapshot.patreon.webhookSecretConfigured && (
                            <Text size="T200" priority="300">
                                Patreon is linked but the server has no PATREON_WEBHOOK_SECRET — webhook
                                deliveries will be rejected. Ask the operator to set it.
                            </Text>
                        )}
                    </SequenceCard>

                    <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                    >
                        <SettingTile
                            title={<Text as="span" size="T300">Streamlabs</Text>}
                            description={
                                <>
                                    Linked: <strong>{snapshot.streamlabs.linked ? 'yes' : 'no'}</strong>{' '}
                                    · Auto-sync:{' '}
                                    <strong>
                                        {snapshot.streamlabs.autosyncRunning ? 'running' : 'stopped'}
                                    </strong>
                                    {snapshot.streamlabs.syncCursor && (
                                        <>
                                            {' · cursor '}
                                            <code>{snapshot.streamlabs.syncCursor}</code>
                                        </>
                                    )}
                                </>
                            }
                        />
                    </SequenceCard>

                    <Text size="T200" priority="300">
                        Snapshot generated {formatRelative(new Date(snapshot.generatedAtMs).toISOString(), nowMs)}.
                    </Text>
                </Box>
            )}
        </Box>
    );
}

export default IntegrationsHealth;
