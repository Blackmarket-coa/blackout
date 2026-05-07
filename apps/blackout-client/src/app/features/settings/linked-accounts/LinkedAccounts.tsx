import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    type LinkedAccountProvider,
    type LinkedAccountSummary,
    IMPLEMENTED_PROVIDERS,
    beginConnect,
    completeCallback,
    listLinkedAccounts,
    parseCallbackUrl,
    unlinkAccount,
} from './linkedAccountsClient';
import { POSTMESSAGE_TYPE, type CallbackResultMessage } from './OAuthCallback';

const PROVIDER_DISPLAY: Record<LinkedAccountProvider, { label: string; description: string }> = {
    twitch: { label: 'Twitch', description: 'Mirror chat, EventSub follows/subs, host Twitch extensions.' },
    discord: { label: 'Discord', description: 'Sync roles + import patrons. Discord-shaped bots will run here.' },
    patreon: { label: 'Patreon', description: 'Sync membership tiers to Blackout roles + creator-sub equivalents.' },
    youtube: { label: 'YouTube Live', description: 'Mirror live chat + SuperChat / channel-membership events.' },
    tiktok: { label: 'TikTok Live', description: 'Coming soon — gift / sub events via Webcast.' },
    kick: { label: 'Kick', description: 'Coming soon — Pusher chat WS + tip webhooks.' },
    streamlabs: { label: 'Streamlabs', description: 'Sync your Streamlabs donations into the same widget alert stream.' },
};

const ALL_PROVIDERS: readonly LinkedAccountProvider[] = [
    'twitch',
    'discord',
    'patreon',
    'youtube',
    'streamlabs',
    'tiktok',
    'kick',
];

const isImplemented = (provider: LinkedAccountProvider): boolean =>
    (IMPLEMENTED_PROVIDERS as readonly string[]).includes(provider);

interface LinkedAccountsProps {
    /**
     * Optional injection point for tests. Defaults to opening a real popup
     * window via window.open().
     */
    openWindow?: (url: string) => Window | null;
}

export function LinkedAccounts({ openWindow }: LinkedAccountsProps = {}) {
    const alive = useAlive();
    const [accounts, setAccounts] = useState<LinkedAccountSummary[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Per-provider transient UI state for the popup-with-paste-back flow.
    const [pendingProvider, setPendingProvider] = useState<LinkedAccountProvider | null>(null);
    const [callbackUrl, setCallbackUrl] = useState('');
    const [providerError, setProviderError] = useState<string | null>(null);
    const [providerNotice, setProviderNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listLinkedAccounts();
            if (!alive()) return;
            setAccounts(res.accounts);
            setLoaded(true);
        } catch (err) {
            if (!alive()) return;
            setLoadError((err as Error).message);
            setLoaded(true);
        }
    }, [alive]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Listen for the OAuth-callback popup's postMessage so this page can
    // auto-refresh + show success / error inline. Same-origin filter on
    // event.origin so a malicious cross-origin tab can't fake outcomes.
    useEffect(() => {
        const onMessage = (evt: MessageEvent) => {
            if (evt.origin !== window.location.origin) return;
            const data = evt.data as Partial<CallbackResultMessage> | null;
            if (!data || data.type !== POSTMESSAGE_TYPE) return;
            if (data.ok) {
                void refresh();
                if (alive()) {
                    setPendingProvider(null);
                    setCallbackUrl('');
                    setProviderError(null);
                    setProviderNotice(
                        `Linked ${data.provider}${data.providerUsername ? ` as ${data.providerUsername}` : ''}.`,
                    );
                }
            } else {
                if (alive()) {
                    setProviderError(
                        `Linking ${data.provider ?? 'account'} failed: ${data.error ?? 'unknown error'}`,
                    );
                }
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [alive, refresh]);

    const [connectState, connect] = useAsyncCallback(
        useCallback(
            async (provider: LinkedAccountProvider) => {
                setProviderError(null);
                setProviderNotice(null);
                setCallbackUrl('');
                const res = await beginConnect(provider);
                const win = (openWindow ?? ((url) => window.open(url, '_blank', 'noopener,noreferrer')))(
                    res.authorizeUrl,
                );
                if (!win) {
                    setProviderError(
                        'Popup was blocked. Allow popups for this site, or open the authorize URL manually.',
                    );
                }
                setPendingProvider(provider);
                setProviderNotice(
                    `Opened ${PROVIDER_DISPLAY[provider].label} authorization in a new tab. After granting access, paste the redirected URL below to finish linking.`,
                );
                return res.authorizeUrl;
            },
            [openWindow],
        ),
    );

    const [completeState, complete] = useAsyncCallback(
        useCallback(
            async (provider: LinkedAccountProvider, redirectedUrl: string) => {
                const parsed = parseCallbackUrl(redirectedUrl);
                if (!parsed) {
                    throw new Error('That does not look like the callback URL. Paste the full URL from your browser address bar.');
                }
                if ('error' in parsed) {
                    throw new Error(`${parsed.error}${parsed.description ? `: ${parsed.description}` : ''}`);
                }
                const res = await completeCallback(provider, parsed);
                await refresh();
                if (alive()) {
                    setPendingProvider(null);
                    setCallbackUrl('');
                    setProviderNotice(`Linked ${PROVIDER_DISPLAY[provider].label}${res.providerUsername ? ` as ${res.providerUsername}` : ''}.`);
                }
                return res;
            },
            [alive, refresh],
        ),
    );

    const [unlinkState, unlink] = useAsyncCallback(
        useCallback(
            async (provider: LinkedAccountProvider) => {
                await unlinkAccount(provider);
                await refresh();
                if (alive()) setProviderNotice(`Unlinked ${PROVIDER_DISPLAY[provider].label}.`);
            },
            [alive, refresh],
        ),
    );

    const busy =
        connectState.status === AsyncStatus.Loading ||
        completeState.status === AsyncStatus.Loading ||
        unlinkState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Linked accounts</Text>
            <Text size="T200" priority="300">
                Link Twitch, Discord, and Patreon so Blackout can mirror their events into your stream
                and unify monetization. Tokens are encrypted at rest with AES-256-GCM. You can unlink at
                any time.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load linked accounts: {loadError}
                </Text>
            )}

            {!loaded && (
                <Box gap="200" alignItems="Center">
                    <Spinner size="200" />
                    <Text size="T200">Loading…</Text>
                </Box>
            )}

            {loaded && (
                <Box direction="Column" gap="100">
                    {ALL_PROVIDERS.map((provider) => {
                        const linked = accounts.find((a) => a.provider === provider);
                        const supported = isImplemented(provider);
                        const meta = PROVIDER_DISPLAY[provider];
                        const isPending = pendingProvider === provider;

                        return (
                            <SequenceCard
                                key={provider}
                                className={SequenceCardStyle}
                                variant="SurfaceVariant"
                                direction="Column"
                                gap="200"
                            >
                                <SettingTile
                                    title={
                                        <Box gap="200" alignItems="Center">
                                            <Text as="span" size="T300">
                                                {meta.label}
                                            </Text>
                                            {linked && (
                                                <Text as="span" size="T200" priority="300">
                                                    Linked as {linked.providerUsername ?? linked.providerUserId}
                                                </Text>
                                            )}
                                        </Box>
                                    }
                                    description={meta.description}
                                    after={
                                        linked ? (
                                            <Button
                                                size="300"
                                                variant="Critical"
                                                fill="None"
                                                radii="Pill"
                                                disabled={busy}
                                                onClick={() => void unlink(provider)}
                                            >
                                                <Text size="B300">Unlink</Text>
                                            </Button>
                                        ) : (
                                            <Button
                                                size="300"
                                                variant="Primary"
                                                fill="Solid"
                                                radii="Pill"
                                                disabled={!supported || busy}
                                                onClick={() => void connect(provider)}
                                            >
                                                <Text size="B300">{supported ? 'Connect' : 'Coming soon'}</Text>
                                            </Button>
                                        )
                                    }
                                />

                                {isPending && supported && !linked && (
                                    <Box direction="Column" gap="200">
                                        <Text size="T200" priority="300">
                                            Paste the URL your browser was redirected to after granting access:
                                        </Text>
                                        <Input
                                            value={callbackUrl}
                                            placeholder={`http://localhost:3000/oauth/${provider}/callback?code=…&state=…`}
                                            variant="Surface"
                                            radii="300"
                                            onChange={(evt) => setCallbackUrl(evt.currentTarget.value)}
                                            data-testid={`linked-accounts-callback-input-${provider}`}
                                        />
                                        <Box gap="200">
                                            <Button
                                                size="300"
                                                variant="Primary"
                                                fill="Solid"
                                                radii="Pill"
                                                disabled={busy || callbackUrl.trim().length === 0}
                                                onClick={() => void complete(provider, callbackUrl)}
                                            >
                                                <Text size="B300">Finish linking</Text>
                                            </Button>
                                            <Button
                                                size="300"
                                                variant="Secondary"
                                                fill="None"
                                                radii="Pill"
                                                disabled={busy}
                                                onClick={() => {
                                                    setPendingProvider(null);
                                                    setCallbackUrl('');
                                                    setProviderNotice(null);
                                                    setProviderError(null);
                                                }}
                                            >
                                                <Text size="B300">Cancel</Text>
                                            </Button>
                                        </Box>
                                    </Box>
                                )}
                            </SequenceCard>
                        );
                    })}
                </Box>
            )}

            {providerNotice && (
                <Text size="T200" priority="300">
                    {providerNotice}
                </Text>
            )}
            {providerError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {providerError}
                </Text>
            )}
            {completeState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(completeState.error as Error).message}
                </Text>
            )}
            {unlinkState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(unlinkState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default LinkedAccounts;
