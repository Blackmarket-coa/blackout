import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    isValidLabel,
    listPasswords,
    mintPassword,
    revokePassword,
    type MintResponse,
    type ObsWsPassword,
} from './obsWsPasswordsClient';

/**
 * Settings panel for OBS-WebSocket v5-compatible passwords. Each row
 * mints a (URL + password) pair the creator pastes into Stream Deck /
 * Companion / Touch Portal — those surfaces drive Blackout via OBS-WS
 * and run unmodified.
 */

interface ObsWsPasswordsProps {
    apiClient?: Parameters<typeof listPasswords>[0];
    /** Override the API origin used to build the absolute wss:// URL. Tests inject this. */
    apiOrigin?: string;
}

const buildAbsoluteUrl = (apiOrigin: string | undefined, path: string): string => {
    const origin =
        apiOrigin ??
        (typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : '');
    // OBS surfaces want a wss:// URL. We swap http(s):// → ws(s):// so
    // creators can paste verbatim.
    const wsOrigin = origin.replace(/^http/i, (m) => (m === 'http' ? 'ws' : 'wss'));
    return `${wsOrigin}${path}`;
};

export function ObsWsPasswords({
    apiClient: testApiClient,
    apiOrigin,
}: ObsWsPasswordsProps = {}) {
    const alive = useAlive();
    const [passwords, setPasswords] = useState<ObsWsPassword[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [label, setLabel] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [revealed, setRevealed] = useState<{ url: string; password: string } | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listPasswords(testApiClient);
            if (!alive()) return;
            setPasswords(res.passwords);
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
            const res = await mintPassword({ label: label.trim() || undefined }, testApiClient);
            await refresh();
            if (alive()) {
                setLabel('');
                setRevealed({
                    url: buildAbsoluteUrl(apiOrigin, res.url),
                    password: res.plaintextPassword,
                });
                setNotice(
                    `Minted password${res.password.label ? ` "${res.password.label}"` : ''}. Copy the URL + password below now — the password won't be shown again.`,
                );
            }
            return res;
        }, [alive, apiOrigin, label, refresh, testApiClient]),
    );

    const [revokeState, submitRevoke] = useAsyncCallback(
        useCallback(
            async (password: ObsWsPassword) => {
                setNotice(null);
                setRevealed(null);
                await revokePassword(password.id, undefined, testApiClient);
                await refresh();
                if (alive()) {
                    setNotice(
                        `Revoked password${password.label ? ` "${password.label}"` : ''}. Any device using it will be disconnected on next reconnect.`,
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
            <Text size="L400">OBS-WebSocket passwords</Text>
            <Text size="T200" priority="300">
                Paste each (URL + password) pair into Stream Deck / Bitfocus Companion /
                Touch Portal. The Blackout server speaks OBS-WS v5; existing OBS-WS
                presets work unmodified. Mint one password per device so you can revoke
                a stolen surface without touching the others.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load passwords: {loadError}
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
                        title={<Text as="span" size="T300">Mint a password</Text>}
                        description="The password is shown only once after minting. Use the label to remember which device this is for."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Label (optional)</Text>
                        <Input
                            value={label}
                            placeholder="Stream Deck (studio)"
                            variant={labelInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setLabel(evt.currentTarget.value)}
                            data-testid="obs-ws-password-label-input"
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
                                data-testid="obs-ws-password-mint-button"
                            >
                                <Text size="B300">Mint password</Text>
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
                        title={<Text as="span" size="T300">Connection details — copy now</Text>}
                        description="Paste the Server URL into your control surface's OBS-WebSocket connection settings, and the password into the password field. After leaving this page the password is unrecoverable."
                    />
                    <Text size="T200">Server URL</Text>
                    <Input
                        value={revealed.url}
                        readOnly
                        variant="Surface"
                        radii="300"
                        data-testid="obs-ws-password-revealed-url"
                    />
                    <Text size="T200">Password</Text>
                    <Input
                        value={revealed.password}
                        readOnly
                        variant="Surface"
                        radii="300"
                        data-testid="obs-ws-password-revealed-password"
                    />
                </SequenceCard>
            )}

            {loaded && passwords.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Active passwords</Text>
                    {passwords.map((pw) => (
                        <SequenceCard
                            key={pw.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {pw.label ?? '(unlabelled)'}
                                        </Text>
                                        {!pw.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (revoked{pw.revokeReason ? `: ${pw.revokeReason}` : ''})
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    `${pw.useCount} connections` +
                                    (pw.lastUsedAt
                                        ? ` · last ${new Date(pw.lastUsedAt).toLocaleString()}`
                                        : '')
                                }
                                after={
                                    pw.isActive ? (
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitRevoke(pw)}
                                            data-testid={`obs-ws-password-revoke-${pw.id}`}
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

export default ObsWsPasswords;
