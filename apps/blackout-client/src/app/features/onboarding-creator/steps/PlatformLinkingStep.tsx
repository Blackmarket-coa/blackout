import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';
import {
    IMPLEMENTED_PROVIDERS,
    beginConnect,
    completeCallback,
    listLinkedAccounts,
    parseCallbackUrl,
    type LinkedAccountProvider,
} from '../../settings/linked-accounts/linkedAccountsClient';
import {
    POSTMESSAGE_TYPE,
    type CallbackResultMessage,
} from '../../settings/linked-accounts/OAuthCallback';
import {
    fetchMyMigrationCredits,
    issueMigrationCredit,
    redeemMigrationCredit,
    type MigrationCreditRecord,
    type MigrationCreditSourceKind,
} from '../../growth';
import { trackCreatorPlatformLinked } from '../creatorOnboardingTelemetry';
import {
    accentButton,
    cardStyle,
    chipRow,
    errorStyle,
    ghostButton,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';
import type { CSSProperties } from 'react';

const PROVIDERS: { id: LinkedAccountProvider; label: string }[] = [
    { id: 'twitch', label: 'Twitch' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'discord', label: 'Discord' },
    { id: 'patreon', label: 'Patreon' },
    { id: 'streamlabs', label: 'Streamlabs' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'kick', label: 'Kick' },
];

const SOURCE_KINDS: { id: MigrationCreditSourceKind; label: string }[] = [
    { id: 'discord_migration', label: 'Discord' },
    { id: 'twitch_migration', label: 'Twitch' },
    { id: 'creator_invite', label: 'Creator invite' },
    { id: 'campaign', label: 'Campaign' },
];

const inputStyle: CSSProperties = {
    flex: '1 1 200px',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'inherit',
    fontSize: 13,
};

const isImplemented = (provider: LinkedAccountProvider): boolean =>
    (IMPLEMENTED_PROVIDERS as readonly string[]).includes(provider);

/**
 * Step 2 — Platform Linking. Connects external platforms via the existing
 * linked-accounts OAuth flow (popup + paste-back callback), and optionally
 * imports migration credits. Reinforces "Blackout strengthens your existing
 * ecosystem."
 */
export const PlatformLinkingStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const [linked, setLinked] = useState<LinkedAccountProvider[]>([]);
    const [pending, setPending] = useState<LinkedAccountProvider | null>(null);
    const [callbackUrl, setCallbackUrl] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const migrationEnabled = runtimeFeatureFlags.onboardingMigrationCredits;
    const [credits, setCredits] = useState<MigrationCreditRecord[]>([]);
    const [sourceKind, setSourceKind] = useState<MigrationCreditSourceKind>('discord_migration');
    const [sourceHandle, setSourceHandle] = useState('');

    const refresh = useCallback(async () => {
        try {
            const response = await listLinkedAccounts();
            const providers = response.accounts.map((account) => account.provider);
            setLinked(providers);
            patch({ linkedProviders: providers });
        } catch {
            /* unauthenticated / offline — leave list empty */
        }
    }, [patch]);

    useEffect(() => {
        void refresh();
        if (migrationEnabled) {
            fetchMyMigrationCredits()
                .then((response) => setCredits(response.items))
                .catch(() => undefined);
        }
    }, [migrationEnabled, refresh]);

    // Listen for the OAuth-callback popup's postMessage (same-origin only).
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data as Partial<CallbackResultMessage> | null;
            if (!data || data.type !== POSTMESSAGE_TYPE) return;
            if (data.ok) {
                if (data.provider) trackCreatorPlatformLinked(data.provider);
                setPending(null);
                setCallbackUrl('');
                setError(null);
                setNotice(`Linked ${data.provider ?? 'account'}.`);
                void refresh();
            } else {
                setError(`Linking ${data.provider ?? 'account'} failed: ${data.error ?? 'unknown error'}`);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [refresh]);

    const connect = async (provider: LinkedAccountProvider) => {
        setError(null);
        setNotice(null);
        setCallbackUrl('');
        setBusy(true);
        try {
            const response = await beginConnect(provider);
            window.open(response.authorizeUrl, '_blank', 'noopener,noreferrer');
            setPending(provider);
            setNotice(
                `Opened ${provider} authorization in a new tab. After granting access, paste the redirected URL below to finish.`
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'connect failed');
        } finally {
            setBusy(false);
        }
    };

    const finishLinking = async () => {
        if (!pending) return;
        const parsed = parseCallbackUrl(callbackUrl);
        if (!parsed) {
            setError('That does not look like the callback URL. Paste the full redirected URL.');
            return;
        }
        if ('error' in parsed) {
            setError(`${parsed.error}${parsed.description ? `: ${parsed.description}` : ''}`);
            return;
        }
        setBusy(true);
        try {
            await completeCallback(pending, parsed);
            trackCreatorPlatformLinked(pending);
            setNotice(`Linked ${pending}.`);
            setPending(null);
            setCallbackUrl('');
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'finish linking failed');
        } finally {
            setBusy(false);
        }
    };

    const handleIssueCredit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        try {
            const { credit } = await issueMigrationCredit({
                sourceKind,
                sourceHandle: sourceHandle.trim() || undefined,
                valueCents: 1000,
            });
            setCredits((prev) => [credit, ...prev.filter((entry) => entry.id !== credit.id)]);
            setSourceHandle('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'credit issue failed');
        } finally {
            setBusy(false);
        }
    };

    const handleRedeem = async (id: string) => {
        setBusy(true);
        try {
            const { credit } = await redeemMigrationCredit(id);
            setCredits((prev) => prev.map((entry) => (entry.id === credit.id ? credit : entry)));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'redeem failed');
        } finally {
            setBusy(false);
        }
    };

    const linkedSet = useMemo(() => new Set(linked), [linked]);

    return (
        <article style={cardStyle} data-testid="creator-step-platform-linking">
            <span style={stepLabelStyle}>Step 2 · Platform linking</span>
            <span style={stepTitleStyle}>Connect your existing platforms</span>
            <span style={stepDescStyle}>
                Blackout strengthens your existing ecosystem — it doesn’t replace it. Link the
                platforms your audience already follows.
            </span>

            {error ? (
                <p style={errorStyle} data-testid="creator-linking-error">
                    {error}
                </p>
            ) : null}
            {notice ? <p style={stepDescStyle}>{notice}</p> : null}

            <div style={chipRow}>
                {PROVIDERS.map((provider) => {
                    const isLinked = linkedSet.has(provider.id);
                    const supported = isImplemented(provider.id);
                    return (
                        <button
                            key={provider.id}
                            type="button"
                            style={isLinked ? ghostButton : accentButton}
                            disabled={isLinked || !supported || busy}
                            onClick={() => void connect(provider.id)}
                            data-testid="creator-link-provider"
                            data-provider={provider.id}
                            data-linked={isLinked ? 'true' : 'false'}
                        >
                            {isLinked
                                ? `${provider.label} ✓`
                                : supported
                                  ? `Connect ${provider.label}`
                                  : `${provider.label} — soon`}
                        </button>
                    );
                })}
            </div>

            {pending ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <input
                        type="text"
                        value={callbackUrl}
                        placeholder="Paste the redirected callback URL"
                        onChange={(event) => setCallbackUrl(event.target.value)}
                        style={inputStyle}
                        data-testid="creator-link-callback-input"
                    />
                    <button
                        type="button"
                        style={accentButton}
                        disabled={busy || callbackUrl.trim().length === 0}
                        onClick={() => void finishLinking()}
                        data-testid="creator-link-finish"
                    >
                        Finish linking
                    </button>
                </div>
            ) : null}

            {migrationEnabled ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={stepDescStyle}>
                        Bring your audience from Discord / Twitch with a starter credit.
                    </span>
                    <form
                        onSubmit={handleIssueCredit}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                    >
                        <select
                            value={sourceKind}
                            onChange={(event) =>
                                setSourceKind(event.target.value as MigrationCreditSourceKind)
                            }
                            style={inputStyle}
                            aria-label="Source platform"
                        >
                            {SOURCE_KINDS.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="@handle"
                            value={sourceHandle}
                            onChange={(event) => setSourceHandle(event.target.value)}
                            style={inputStyle}
                            data-testid="creator-migration-handle"
                        />
                        <button
                            type="submit"
                            style={accentButton}
                            disabled={busy}
                            data-testid="creator-migration-issue"
                        >
                            Issue credit
                        </button>
                    </form>
                    {credits.map((credit) => (
                        <div
                            key={credit.id}
                            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                            data-testid="creator-migration-credit"
                        >
                            <span style={{ flex: 1, fontSize: 13 }}>
                                {(credit.valueCents / 100).toFixed(0)} {credit.currency} ·{' '}
                                {credit.sourceKind}
                            </span>
                            {credit.redeemedAt ? (
                                <span style={stepDescStyle}>Redeemed</span>
                            ) : (
                                <button
                                    type="button"
                                    style={ghostButton}
                                    disabled={busy}
                                    onClick={() => void handleRedeem(credit.id)}
                                >
                                    Redeem
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
        </article>
    );
};

export default PlatformLinkingStep;
