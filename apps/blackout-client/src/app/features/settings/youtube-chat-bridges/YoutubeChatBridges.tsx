import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    listLinkedAccounts,
    type LinkedAccountSummary,
} from '../linked-accounts/linkedAccountsClient';
import {
    createBridge,
    deleteBridge,
    isValidMatrixRoomId,
    isValidYoutubeChannelId,
    listBridges,
    syncBridge,
    type YoutubeChatBridgeRecord,
} from './youtubeChatBridgesClient';

/**
 * Settings panel for YouTube Live chat bridges. A creator with a linked
 * YouTube account declares {youtubeChannelId, matrixRoomId} pairs that
 * the server's poller turns into live chat-into-Matrix mirrors. Mirrors
 * the existing TwitchChatBridges section's shape so the two sit next to
 * each other in Settings → Account.
 */

interface YoutubeChatBridgesProps {
    /** Optional injection point for tests. */
    apiClient?: Parameters<typeof listBridges>[0];
}

export function YoutubeChatBridges({ apiClient: testApiClient }: YoutubeChatBridgesProps = {}) {
    const alive = useAlive();
    const [youtubeLink, setYoutubeLink] = useState<LinkedAccountSummary | null>(null);
    const [bridges, setBridges] = useState<YoutubeChatBridgeRecord[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [channelId, setChannelId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [linkedRes, bridgesRes] = await Promise.all([
                listLinkedAccounts(testApiClient),
                listBridges(testApiClient),
            ]);
            if (!alive()) return;
            setYoutubeLink(linkedRes.accounts.find((a) => a.provider === 'youtube') ?? null);
            setBridges(bridgesRes.bridges);
            setLoaded(true);
        } catch (err) {
            if (!alive()) return;
            setLoadError((err as Error).message);
            setLoaded(true);
        }
    }, [alive, testApiClient]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const channelInvalid = channelId.length > 0 && !isValidYoutubeChannelId(channelId);
    const roomInvalid = roomId.length > 0 && !isValidMatrixRoomId(roomId);
    const canSubmit = useMemo(
        () =>
            isValidYoutubeChannelId(channelId) &&
            isValidMatrixRoomId(roomId) &&
            youtubeLink !== null,
        [channelId, roomId, youtubeLink],
    );

    const [createState, submitCreate] = useAsyncCallback(
        useCallback(async () => {
            setNotice(null);
            const res = await createBridge(
                { youtubeChannelId: channelId.trim(), matrixRoomId: roomId.trim() },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setRoomId('');
                setNotice(`Bridged ${res.bridge.youtubeChannelId} → ${res.bridge.matrixRoomId}.`);
            }
            return res;
        }, [alive, channelId, refresh, roomId, testApiClient]),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (bridge: YoutubeChatBridgeRecord) => {
                setNotice(null);
                await deleteBridge(bridge.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed bridge for ${bridge.youtubeChannelId}.`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const [syncState, submitSync] = useAsyncCallback(
        useCallback(
            async (bridge: YoutubeChatBridgeRecord) => {
                setNotice(null);
                const res = await syncBridge(bridge.id, testApiClient);
                if (alive()) {
                    setNotice(
                        res.delivered === 0
                            ? `Synced ${bridge.youtubeChannelId}: no new messages this tick.`
                            : `Synced ${bridge.youtubeChannelId}: forwarded ${res.delivered} message${res.delivered === 1 ? '' : 's'}.`,
                    );
                }
                return res;
            },
            [alive, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading ||
        deleteState.status === AsyncStatus.Loading ||
        syncState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">YouTube Live chat bridges</Text>
            <Text size="T200" priority="300">
                Mirror your YouTube Live chat into a Blackout den. Each message arrives as a
                normal Matrix message tagged with its YouTube origin; SuperChats render as
                notice-style alerts so client styling can highlight them.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load bridges: {loadError}
                </Text>
            )}

            {!loaded && (
                <Box gap="200" alignItems="Center">
                    <Spinner size="200" />
                    <Text size="T200">Loading…</Text>
                </Box>
            )}

            {loaded && !youtubeLink && (
                <Text size="T200" priority="300">
                    Link your YouTube account in the section above before creating a bridge.
                </Text>
            )}

            {loaded && youtubeLink && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Create a bridge</Text>}
                        description={
                            <>
                                Enter your YouTube channel id (starts with <code>UC</code> followed by
                                22+ characters) and the Matrix room id of the den you want chat to
                                flow into. Find your channel id under YouTube Studio → Settings →
                                Channel → Advanced settings.
                            </>
                        }
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">YouTube channel id</Text>
                        <Input
                            value={channelId}
                            placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                            variant={channelInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setChannelId(evt.currentTarget.value)}
                            data-testid="youtube-bridge-channel-input"
                        />
                        {channelInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Channel id should look like <code>UC</code> + 22 characters
                                (letters, digits, _ or -).
                            </Text>
                        )}
                        <Text size="T200">Matrix room</Text>
                        <Input
                            value={roomId}
                            placeholder="!opaque:server.tld"
                            variant={roomInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setRoomId(evt.currentTarget.value)}
                            data-testid="youtube-bridge-room-input"
                        />
                        {roomInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Matrix room id should look like <code>!opaque:server.tld</code>.
                            </Text>
                        )}
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={!canSubmit || busy}
                                onClick={() => void submitCreate()}
                                data-testid="youtube-bridge-create-button"
                            >
                                <Text size="B300">Create bridge</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && bridges.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Active bridges</Text>
                    {bridges.map((bridge) => (
                        <SequenceCard
                            key={bridge.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {bridge.youtubeChannelId}
                                        </Text>
                                        <Text as="span" size="T200" priority="300">
                                            → {bridge.matrixRoomId}
                                        </Text>
                                        {!bridge.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (inactive)
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={`Created ${new Date(bridge.createdAt).toLocaleString()}`}
                                after={
                                    <Box gap="200" alignItems="Center">
                                        <Button
                                            size="300"
                                            variant="Primary"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitSync(bridge)}
                                            data-testid={`youtube-bridge-sync-${bridge.id}`}
                                        >
                                            <Text size="B300">Sync now</Text>
                                        </Button>
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitDelete(bridge)}
                                            data-testid={`youtube-bridge-delete-${bridge.id}`}
                                        >
                                            <Text size="B300">Remove</Text>
                                        </Button>
                                    </Box>
                                }
                            />
                        </SequenceCard>
                    ))}
                </Box>
            )}

            {notice && (
                <Text size="T200" priority="300">
                    {notice}
                </Text>
            )}
            {createState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(createState.error as Error).message}
                </Text>
            )}
            {deleteState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(deleteState.error as Error).message}
                </Text>
            )}
            {syncState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(syncState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default YoutubeChatBridges;
