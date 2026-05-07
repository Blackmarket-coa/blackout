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
    isValidTwitchChannelLogin,
    listBridges,
    type TwitchChatBridgeRecord,
} from './twitchChatBridgesClient';

/**
 * Settings panel for managing Twitch chat bridges (Phase 1 / Track A). Lets
 * a creator declare {twitchChannel, matrixRoomId} pairs that the server
 * turns into live WSS-→-Matrix bridges (see services/twitchChatBridge.ts).
 *
 * Gated on the user having a linked Twitch account — otherwise we'd let
 * them author a bridge that can never connect. The default value for the
 * channel input is the linked Twitch login.
 */

interface TwitchChatBridgesProps {
    /**
     * Optional injection point for tests. Defaults to the real network
     * client; pass an api client for unit tests.
     */
    apiClient?: Parameters<typeof listBridges>[0];
}

export function TwitchChatBridges({ apiClient: testApiClient }: TwitchChatBridgesProps = {}) {
    const alive = useAlive();
    const [twitchLink, setTwitchLink] = useState<LinkedAccountSummary | null>(null);
    const [bridges, setBridges] = useState<TwitchChatBridgeRecord[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [channel, setChannel] = useState('');
    const [roomId, setRoomId] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [linkedRes, bridgesRes] = await Promise.all([
                listLinkedAccounts(testApiClient),
                listBridges(testApiClient),
            ]);
            if (!alive()) return;
            const tw = linkedRes.accounts.find((a) => a.provider === 'twitch') ?? null;
            setTwitchLink(tw);
            setBridges(bridgesRes.bridges);
            // Default the channel input to the linked Twitch username on
            // first load — the streamer almost always wants to bridge their
            // own channel.
            if (tw && !channel) {
                const candidate = tw.providerUsername ?? '';
                if (isValidTwitchChannelLogin(candidate)) setChannel(candidate.toLowerCase());
            }
            setLoaded(true);
        } catch (err) {
            if (!alive()) return;
            setLoadError((err as Error).message);
            setLoaded(true);
        }
        // `channel` is read inside the callback as a default-only seed; we
        // do NOT want refresh to re-trigger when the user types in the
        // input, so omit it from the dep list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alive, testApiClient]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const channelInvalid = channel.length > 0 && !isValidTwitchChannelLogin(channel);
    const roomInvalid = roomId.length > 0 && !isValidMatrixRoomId(roomId);
    const canSubmit = useMemo(
        () =>
            isValidTwitchChannelLogin(channel) &&
            isValidMatrixRoomId(roomId) &&
            twitchLink !== null,
        [channel, roomId, twitchLink],
    );

    const [createState, submitCreate] = useAsyncCallback(
        useCallback(async () => {
            setError(null);
            setNotice(null);
            const res = await createBridge(
                { twitchChannel: channel.trim(), matrixRoomId: roomId.trim() },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setRoomId('');
                setNotice(`Bridged ${res.bridge.twitchChannel} → ${res.bridge.matrixRoomId}.`);
            }
            return res;
        }, [alive, channel, refresh, roomId, testApiClient]),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (bridge: TwitchChatBridgeRecord) => {
                setError(null);
                setNotice(null);
                await deleteBridge(bridge.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed bridge for ${bridge.twitchChannel}.`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading || deleteState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Twitch chat bridges</Text>
            <Text size="T200" priority="300">
                Send your Twitch channel’s chat into a Blackout den room. Each message arrives as a
                normal Matrix message tagged with its Twitch origin so it shows up alongside your
                native Blackout chat.
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

            {loaded && !twitchLink && (
                <Text size="T200" priority="300">
                    Link your Twitch account in the section above before creating a bridge.
                </Text>
            )}

            {loaded && twitchLink && (
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
                                Enter the Twitch channel login (1-25 chars, [A-Z a-z 0-9 _]) and the
                                Matrix room id of the den you want chat to flow into. Use the room id
                                that looks like <code>!opaque:server.tld</code>; aliases like
                                <code> #alias:server.tld</code> also work.
                            </>
                        }
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Twitch channel</Text>
                        <Input
                            value={channel}
                            placeholder="streamer-login"
                            variant={channelInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setChannel(evt.currentTarget.value)}
                            data-testid="twitch-bridge-channel-input"
                        />
                        {channelInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Twitch logins are 1-25 characters of letters, digits, and underscores.
                            </Text>
                        )}
                        <Text size="T200">Matrix room</Text>
                        <Input
                            value={roomId}
                            placeholder="!opaque:server.tld"
                            variant={roomInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setRoomId(evt.currentTarget.value)}
                            data-testid="twitch-bridge-room-input"
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
                                data-testid="twitch-bridge-create-button"
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
                                            #{bridge.twitchChannel}
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
                                    <Button
                                        size="300"
                                        variant="Critical"
                                        fill="None"
                                        radii="Pill"
                                        disabled={busy}
                                        onClick={() => void submitDelete(bridge)}
                                        data-testid={`twitch-bridge-delete-${bridge.id}`}
                                    >
                                        <Text size="B300">Remove</Text>
                                    </Button>
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
            {error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {error}
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
        </Box>
    );
}

export default TwitchChatBridges;
