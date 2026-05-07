import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    createBridge,
    deleteBridge,
    isValidKickChatroomId,
    isValidMatrixRoomId,
    listBridges,
    type KickChatBridgeRecord,
} from './kickChatBridgesClient';

/**
 * Settings panel for Kick chat bridges. Kick chat is public — no OAuth
 * link required. The creator just enters a numeric chatroom id (find
 * it at https://kick.com/api/v2/channels/<slug> → chatroom.id) and the
 * Matrix room they want messages forwarded into.
 */

interface KickChatBridgesProps {
    apiClient?: Parameters<typeof listBridges>[0];
}

export function KickChatBridges({ apiClient: testApiClient }: KickChatBridgesProps = {}) {
    const alive = useAlive();
    const [bridges, setBridges] = useState<KickChatBridgeRecord[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [chatroomId, setChatroomId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listBridges(testApiClient);
            if (!alive()) return;
            setBridges(res.bridges);
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

    const chatroomInvalid = chatroomId.length > 0 && !isValidKickChatroomId(chatroomId);
    const roomInvalid = roomId.length > 0 && !isValidMatrixRoomId(roomId);
    const canSubmit = useMemo(
        () => isValidKickChatroomId(chatroomId) && isValidMatrixRoomId(roomId),
        [chatroomId, roomId],
    );

    const [createState, submitCreate] = useAsyncCallback(
        useCallback(async () => {
            setNotice(null);
            const res = await createBridge(
                { kickChatroomId: chatroomId.trim(), matrixRoomId: roomId.trim() },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setRoomId('');
                setNotice(`Bridged Kick chatroom ${res.bridge.kickChatroomId} → ${res.bridge.matrixRoomId}.`);
            }
            return res;
        }, [alive, chatroomId, refresh, roomId, testApiClient]),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (bridge: KickChatBridgeRecord) => {
                setNotice(null);
                await deleteBridge(bridge.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed bridge for chatroom ${bridge.kickChatroomId}.`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading || deleteState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Kick chat bridges</Text>
            <Text size="T200" priority="300">
                Mirror your Kick chatroom into a Blackout den. Kick chat is public, so no OAuth
                link is required — just paste the chatroom id (find it at{' '}
                <code>https://kick.com/api/v2/channels/&lt;your-slug&gt;</code> in the{' '}
                <code>chatroom.id</code> field).
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

            {loaded && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Create a bridge</Text>}
                        description="Numeric chatroom id (NOT your channel slug). Matrix room id of the den that will receive forwarded messages."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Kick chatroom id</Text>
                        <Input
                            value={chatroomId}
                            placeholder="12345"
                            variant={chatroomInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setChatroomId(evt.currentTarget.value)}
                            data-testid="kick-bridge-chatroom-input"
                        />
                        {chatroomInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Chatroom id must be a positive integer (no leading zeros).
                            </Text>
                        )}
                        <Text size="T200">Matrix room</Text>
                        <Input
                            value={roomId}
                            placeholder="!opaque:server.tld"
                            variant={roomInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setRoomId(evt.currentTarget.value)}
                            data-testid="kick-bridge-room-input"
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
                                data-testid="kick-bridge-create-button"
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
                                            chatroom {bridge.kickChatroomId}
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
                                        data-testid={`kick-bridge-delete-${bridge.id}`}
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

export default KickChatBridges;
