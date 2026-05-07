import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    isValidLabel,
    listSessions,
    listTokens,
    mintToken,
    revokeToken,
    type IrcBotSessionSnapshot,
    type MintResponse,
    type TwitchIrcBotToken,
} from './twitchIrcBotTokensClient';

/**
 * Settings panel for Twitch-IRC-compatible bot tokens. Lets a creator
 * mint a bearer secret to paste into a 3rd-party Twitch chat bot
 * (Nightbot, StreamElements, Moobot, ...) so the bot can connect to
 * the (forthcoming) Blackout IRC shim with `PASS oauth:<plaintext>`.
 */

interface TwitchIrcBotTokensProps {
    apiClient?: Parameters<typeof listTokens>[0];
}

export function TwitchIrcBotTokens({ apiClient: testApiClient }: TwitchIrcBotTokensProps = {}) {
    const alive = useAlive();
    const [tokens, setTokens] = useState<TwitchIrcBotToken[]>([]);
    const [sessions, setSessions] = useState<IrcBotSessionSnapshot[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [label, setLabel] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [revealed, setRevealed] = useState<{ id: string; passLine: string } | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            // Tokens (config) and sessions (runtime) fetched in parallel.
            // A 5xx on sessions doesn't break the panel — bots may simply
            // not be connected yet.
            const [tokensRes, sessionsRes] = await Promise.all([
                listTokens(testApiClient),
                listSessions(testApiClient).catch(() => ({ sessions: [] as IrcBotSessionSnapshot[] })),
            ]);
            if (!alive()) return;
            setTokens(tokensRes.tokens);
            setSessions(sessionsRes.sessions);
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

    const labelInvalid = label.length > 0 && !isValidLabel(label);
    const canSubmit = useMemo(() => isValidLabel(label), [label]);

    const [createState, submitCreate] = useAsyncCallback<MintResponse, Error, []>(
        useCallback(async () => {
            setNotice(null);
            setRevealed(null);
            const res = await mintToken({ label: label.trim() || undefined }, testApiClient);
            await refresh();
            if (alive()) {
                setLabel('');
                setRevealed({ id: res.token.id, passLine: res.passLine });
                setNotice(
                    `Minted token${res.token.label ? ` "${res.token.label}"` : ''}. Copy the OAuth line below now — it won't be shown again.`,
                );
            }
            return res;
        }, [alive, label, refresh, testApiClient]),
    );

    const [revokeState, submitRevoke] = useAsyncCallback(
        useCallback(
            async (token: TwitchIrcBotToken) => {
                setNotice(null);
                setRevealed(null);
                await revokeToken(token.id, undefined, testApiClient);
                await refresh();
                if (alive()) {
                    setNotice(
                        `Revoked token${token.label ? ` "${token.label}"` : ''}. Any bot using it will be disconnected on next use.`,
                    );
                }
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading || revokeState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Twitch IRC bot tokens</Text>
            <Text size="T200" priority="300">
                Paste these into a 3rd-party Twitch chat bot's "OAuth Token" field
                (Nightbot, StreamElements, Moobot, Fossabot, ...). The bot connects to
                Blackout's IRC shim and runs unmodified.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load tokens: {loadError}
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
                        title={<Text as="span" size="T300">Mint a bot token</Text>}
                        description="Optional label helps you tell tokens apart (e.g. one per bot). The OAuth line is shown only once after minting."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Label (optional)</Text>
                        <Input
                            value={label}
                            placeholder="Nightbot"
                            variant={labelInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setLabel(evt.currentTarget.value)}
                            data-testid="twitch-irc-token-label-input"
                        />
                        {labelInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Label must be ≤ 80 characters.
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
                                data-testid="twitch-irc-token-mint-button"
                            >
                                <Text size="B300">Mint token</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {revealed && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">OAuth line — copy now</Text>}
                        description="Paste this whole string into the bot's OAuth Token field. After leaving this page the secret is unrecoverable; if you lose it, revoke and re-mint."
                    />
                    <Input
                        value={revealed.passLine}
                        readOnly
                        variant="Surface"
                        radii="300"
                        data-testid="twitch-irc-token-revealed"
                    />
                </SequenceCard>
            )}

            {loaded && tokens.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Active tokens</Text>
                    {tokens.map((token) => (
                        <SequenceCard
                            key={token.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {token.label ?? '(unlabelled)'}
                                        </Text>
                                        {!token.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (revoked{token.revokeReason ? `: ${token.revokeReason}` : ''})
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    `${token.useCount} uses` +
                                    (token.lastUsedAt
                                        ? ` · last ${new Date(token.lastUsedAt).toLocaleString()}`
                                        : '') +
                                    (token.scopes.length > 0
                                        ? ` · scoped to ${token.scopes.length} channel(s)`
                                        : ' · all channels')
                                }
                                after={
                                    token.isActive ? (
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitRevoke(token)}
                                            data-testid={`twitch-irc-token-revoke-${token.id}`}
                                        >
                                            <Text size="B300">Revoke</Text>
                                        </Button>
                                    ) : undefined
                                }
                            />
                        </SequenceCard>
                    ))}
                </Box>
            )}

            {loaded && sessions.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Connected bots</Text>
                    {sessions.map((session) => {
                        const matchedToken = tokens.find((t) => t.id === session.tokenId);
                        const tokenLabel =
                            matchedToken?.label ?? `(token ${session.tokenId.slice(0, 8)})`;
                        const channelsLabel =
                            session.joinedChannels.length === 0
                                ? 'no channels joined'
                                : session.joinedChannels.join(', ');
                        return (
                            <SequenceCard
                                key={`${session.tokenId}:${session.nick}:${session.connectedAt}`}
                                className={SequenceCardStyle}
                                variant="SurfaceVariant"
                                direction="Column"
                                gap="200"
                            >
                                <SettingTile
                                    title={
                                        <Box gap="200" alignItems="Center">
                                            <Text as="span" size="T300">
                                                {session.nick}
                                            </Text>
                                            <Text as="span" size="T200" priority="300">
                                                via {tokenLabel}
                                            </Text>
                                        </Box>
                                    }
                                    description={
                                        `${channelsLabel} · connected ${new Date(session.connectedAt).toLocaleString()}` +
                                        ` · last activity ${new Date(session.lastActivityAt).toLocaleString()}`
                                    }
                                />
                            </SequenceCard>
                        );
                    })}
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
            {revokeState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(revokeState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default TwitchIrcBotTokens;
