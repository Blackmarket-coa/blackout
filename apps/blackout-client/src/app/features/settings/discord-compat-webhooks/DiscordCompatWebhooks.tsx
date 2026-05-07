import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    createWebhook,
    deleteWebhook,
    isValidAvatarUrl,
    isValidMatrixRoomId,
    isValidWebhookName,
    listWebhooks,
    type CreateWebhookResponse,
    type DiscordCompatWebhook,
} from './discordCompatWebhooksClient';

/**
 * Settings panel for Discord-shape inbound webhooks. Lets the creator mint
 * a Discord-wire-compatible URL that they paste into 3rd-party services
 * (GitHub, Sentry, Stripe, IFTTT, Zapier, Grafana, ...) — the service
 * believes it's posting to Discord; Blackout receives the payload and
 * forwards it into a Matrix den room.
 */

interface DiscordCompatWebhooksProps {
    apiClient?: Parameters<typeof listWebhooks>[0];
    /** Override the API origin used to build the copy-paste URL. Tests inject this. */
    apiOrigin?: string;
}

const buildExecuteUrl = (apiOrigin: string | undefined, urlPath: string): string => {
    const origin =
        apiOrigin ??
        (typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : '');
    return `${origin}${urlPath}`;
};

export function DiscordCompatWebhooks({
    apiClient: testApiClient,
    apiOrigin,
}: DiscordCompatWebhooksProps = {}) {
    const alive = useAlive();
    const [webhooks, setWebhooks] = useState<DiscordCompatWebhook[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [name, setName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    /** Plaintext URL surfaced ONCE after a successful create. */
    const [revealedUrl, setRevealedUrl] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listWebhooks(testApiClient);
            if (!alive()) return;
            setWebhooks(res.webhooks);
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

    const nameInvalid = name.length > 0 && !isValidWebhookName(name);
    const roomInvalid = roomId.length > 0 && !isValidMatrixRoomId(roomId);
    const avatarInvalid = avatarUrl.length > 0 && !isValidAvatarUrl(avatarUrl);
    const canSubmit = useMemo(
        () =>
            isValidWebhookName(name) &&
            isValidMatrixRoomId(roomId) &&
            isValidAvatarUrl(avatarUrl),
        [name, roomId, avatarUrl],
    );

    const [createState, submitCreate] = useAsyncCallback<CreateWebhookResponse, Error, []>(
        useCallback(async () => {
            setNotice(null);
            setRevealedUrl(null);
            const res = await createWebhook(
                {
                    name: name.trim(),
                    matrixRoomId: roomId.trim(),
                    avatarUrl: avatarUrl.trim() || undefined,
                },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setName('');
                setRoomId('');
                setAvatarUrl('');
                setRevealedUrl(buildExecuteUrl(apiOrigin, res.url));
                setNotice(
                    `Created webhook "${res.webhook.name}". Copy the URL below now — it won't be shown again.`,
                );
            }
            return res;
        }, [alive, apiOrigin, avatarUrl, name, refresh, roomId, testApiClient]),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (webhook: DiscordCompatWebhook) => {
                setNotice(null);
                setRevealedUrl(null);
                await deleteWebhook(webhook.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed webhook "${webhook.name}".`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading || deleteState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Discord-shape inbound webhooks</Text>
            <Text size="T200" priority="300">
                Mint a URL that 3rd-party services posting to "Discord webhooks" can target —
                GitHub, Sentry, Stripe, IFTTT, Zapier, Grafana, etc. Each call is forwarded
                into the Matrix room you choose.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load webhooks: {loadError}
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
                        title={<Text as="span" size="T300">Create a webhook</Text>}
                        description="The label is just for you — Discord-style senders pick their own per-call username and avatar. The URL is shown only once after creation."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Label</Text>
                        <Input
                            value={name}
                            placeholder="GitHub"
                            variant={nameInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setName(evt.currentTarget.value)}
                            data-testid="discord-webhook-name-input"
                        />
                        {nameInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Label is required and must be ≤ 80 characters.
                            </Text>
                        )}

                        <Text size="T200">Matrix room</Text>
                        <Input
                            value={roomId}
                            placeholder="!opaque:server.tld"
                            variant={roomInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setRoomId(evt.currentTarget.value)}
                            data-testid="discord-webhook-room-input"
                        />
                        {roomInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Matrix room id should look like <code>!opaque:server.tld</code>.
                            </Text>
                        )}

                        <Text size="T200">Default avatar URL (optional)</Text>
                        <Input
                            value={avatarUrl}
                            placeholder="https://example.com/icon.png"
                            variant={avatarInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setAvatarUrl(evt.currentTarget.value)}
                            data-testid="discord-webhook-avatar-input"
                        />
                        {avatarInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Must be an http(s) URL, ≤ 2048 characters.
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
                                data-testid="discord-webhook-create-button"
                            >
                                <Text size="B300">Create webhook</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {revealedUrl && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Webhook URL — copy now</Text>}
                        description="Paste this into the source service. The token portion is shown only this once; if you lose it, delete the webhook and create a new one."
                    />
                    <Input
                        value={revealedUrl}
                        readOnly
                        variant="Surface"
                        radii="300"
                        data-testid="discord-webhook-revealed-url"
                    />
                </SequenceCard>
            )}

            {loaded && webhooks.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Active webhooks</Text>
                    {webhooks.map((webhook) => (
                        <SequenceCard
                            key={webhook.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {webhook.name}
                                        </Text>
                                        <Text as="span" size="T200" priority="300">
                                            → {webhook.matrixRoomId}
                                        </Text>
                                        {!webhook.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (inactive)
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={`Created ${new Date(webhook.createdAt).toLocaleString()} · ${webhook.deliveryCount} deliveries${webhook.lastUsedAt ? ` · last used ${new Date(webhook.lastUsedAt).toLocaleString()}` : ''}`}
                                after={
                                    <Button
                                        size="300"
                                        variant="Critical"
                                        fill="None"
                                        radii="Pill"
                                        disabled={busy}
                                        onClick={() => void submitDelete(webhook)}
                                        data-testid={`discord-webhook-delete-${webhook.id}`}
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

export default DiscordCompatWebhooks;
