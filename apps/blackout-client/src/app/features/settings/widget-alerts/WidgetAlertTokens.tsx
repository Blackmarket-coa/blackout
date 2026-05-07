import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    buildSseUrl,
    createToken,
    listTokens,
    revokeToken,
    sendTestAlert,
    type TestAlertType,
    type WidgetAlertTokenSummary,
} from './widgetAlertsClient';

/**
 * Settings panel for browser-source overlay tokens (Phase 1 / Track A).
 * Each token is a long-lived bearer secret a creator pastes into OBS's
 * "browser source" URL field. The plaintext is shown ONCE, immediately
 * after creation, and never again — so the UX has to make copying
 * frictionless.
 */

interface WidgetAlertTokensProps {
    /** Optional injection point for tests. */
    apiClient?: Parameters<typeof listTokens>[0];
}

interface OneTimeReveal {
    secret: string;
    sseUrl: string;
    label?: string;
}

export function WidgetAlertTokens({ apiClient: testApiClient }: WidgetAlertTokensProps = {}) {
    const alive = useAlive();
    const [tokens, setTokens] = useState<WidgetAlertTokenSummary[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [label, setLabel] = useState('');
    const [reveal, setReveal] = useState<OneTimeReveal | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listTokens(testApiClient);
            if (!alive()) return;
            setTokens(res.tokens);
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

    const [createState, submitCreate] = useAsyncCallback(
        useCallback(async () => {
            setNotice(null);
            const res = await createToken(
                label.trim() ? { label: label.trim() } : {},
                testApiClient,
            );
            await refresh();
            if (!alive()) return res;
            // Critical: hold the plaintext ONLY in component state, never
            // in localStorage / cookies / global stores. When the modal
            // dismisses the secret is dropped and unrecoverable.
            setReveal({
                secret: res.secret,
                sseUrl: buildSseUrl(res.secret),
                label: res.token.label,
            });
            setLabel('');
            return res;
        }, [alive, label, refresh, testApiClient]),
    );

    const [revokeState, submitRevoke] = useAsyncCallback(
        useCallback(
            async (token: WidgetAlertTokenSummary) => {
                setNotice(null);
                await revokeToken(token.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Revoked ${token.label ?? token.id}.`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const [testState, submitTest] = useAsyncCallback(
        useCallback(
            async (type: TestAlertType) => {
                setNotice(null);
                const res = await sendTestAlert({ type, name: 'TestUser' }, testApiClient);
                if (alive()) {
                    setNotice(
                        res.delivered > 0
                            ? `Test ${type} alert delivered to ${res.delivered} connected widget${res.delivered === 1 ? '' : 's'}.`
                            : `Test ${type} alert published, but no widgets are connected. Open your OBS browser source to see it.`,
                    );
                }
                return res;
            },
            [alive, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading ||
        revokeState.status === AsyncStatus.Loading ||
        testState.status === AsyncStatus.Loading;

    const copy = (text: string, what: string) => {
        // navigator.clipboard is gated on secure contexts in some browsers;
        // we fall back to a no-op + status message rather than throwing.
        try {
            void navigator.clipboard.writeText(text);
            setNotice(`Copied ${what} to clipboard.`);
        } catch {
            setNotice(`Could not access the clipboard. Copy ${what} manually.`);
        }
    };

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Browser-source widget tokens</Text>
            <Text size="T200" priority="300">
                Each token is a long-lived URL you paste into OBS’s “browser source” to receive
                follow / sub / cheer / raid alerts as Server-Sent Events. The wire shape mirrors
                Streamlabs’s documented payload, so any existing alert overlay drops in unchanged
                once you swap the URL. The plaintext token is shown once on creation; copy it then
                or revoke and recreate.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load widget tokens: {loadError}
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
                        title={<Text as="span" size="T300">Create a new token</Text>}
                        description="Optional label helps you identify which OBS scene / device a token belongs to."
                    />
                    <Box direction="Column" gap="100">
                        <Input
                            value={label}
                            placeholder="Main OBS"
                            variant="Surface"
                            radii="300"
                            onChange={(evt) => setLabel(evt.currentTarget.value)}
                            data-testid="widget-token-label-input"
                        />
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={busy}
                                onClick={() => void submitCreate()}
                                data-testid="widget-token-create-button"
                            >
                                <Text size="B300">Create token</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {reveal && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                    data-testid="widget-token-reveal"
                >
                    <SettingTile
                        title={
                            <Text as="span" size="T300">
                                {reveal.label ? `Token: ${reveal.label}` : 'New token'} — copy now
                            </Text>
                        }
                        description={
                            <>
                                <strong>This is the only time you’ll see this secret.</strong> Paste
                                the URL below into the “URL” field of an OBS browser source. If you
                                lose it, revoke this token and create a new one.
                            </>
                        }
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Browser-source URL</Text>
                        <Input
                            value={reveal.sseUrl}
                            readOnly
                            variant="Surface"
                            radii="300"
                            data-testid="widget-token-sse-url"
                        />
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                onClick={() => copy(reveal.sseUrl, 'browser-source URL')}
                                data-testid="widget-token-copy-url"
                            >
                                <Text size="B300">Copy URL</Text>
                            </Button>
                            <Button
                                size="300"
                                variant="Secondary"
                                fill="None"
                                radii="Pill"
                                onClick={() => copy(reveal.secret, 'token secret')}
                            >
                                <Text size="B300">Copy secret only</Text>
                            </Button>
                            <Button
                                size="300"
                                variant="Secondary"
                                fill="None"
                                radii="Pill"
                                onClick={() => setReveal(null)}
                                data-testid="widget-token-reveal-dismiss"
                            >
                                <Text size="B300">I’ve saved it</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Send a test alert</Text>}
                        description="Fires a synthetic alert to every widget currently connected to your tokens. Useful for verifying your overlay renders correctly without waiting for a real follow / sub / cheer / raid."
                    />
                    <Box gap="200" wrap="Wrap">
                        {(['follow', 'subscribe', 'subscription_gift', 'cheer', 'raid'] as TestAlertType[]).map(
                            (type) => (
                                <Button
                                    key={type}
                                    size="300"
                                    variant="Secondary"
                                    fill="Solid"
                                    radii="Pill"
                                    disabled={busy}
                                    onClick={() => void submitTest(type)}
                                    data-testid={`widget-test-alert-${type}`}
                                >
                                    <Text size="B300">Test {type}</Text>
                                </Button>
                            ),
                        )}
                    </Box>
                </SequenceCard>
            )}

            {loaded && tokens.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Your tokens</Text>
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
                                            {token.label ?? `Token ${token.id.slice(0, 8)}`}
                                        </Text>
                                        {token.revokedAt && (
                                            <Text as="span" size="T200" priority="300">
                                                (revoked)
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    <>
                                        Created {new Date(token.createdAt).toLocaleString()}
                                        {token.lastDeliveredAt
                                            ? `, last delivered ${new Date(token.lastDeliveredAt).toLocaleString()}`
                                            : ', never delivered'}
                                    </>
                                }
                                after={
                                    !token.revokedAt && (
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitRevoke(token)}
                                            data-testid={`widget-token-revoke-${token.id}`}
                                        >
                                            <Text size="B300">Revoke</Text>
                                        </Button>
                                    )
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
            {testState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(testState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default WidgetAlertTokens;
