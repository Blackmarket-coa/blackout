import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CREATOR_LISTINGS_PATH } from '../../pages/paths';
import {
    fetchMyMigrationCredits,
    issueMigrationCredit,
    redeemMigrationCredit,
    type MigrationCreditRecord,
    type MigrationCreditSourceKind,
} from '../growth';
import { fetchCreatorProviders, startCreatorPayoutOnboarding } from '../creators/creatorClient';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const stepperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '12px 16px 24px',
};

const stepCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

const stepLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

const stepTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 600 };
const stepDescStyle: CSSProperties = {
    fontSize: 13,
    lineHeight: 1.45,
    color: 'var(--text-muted, #9ca3af)',
};

const formRow: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const inputStyle: CSSProperties = {
    flex: '1 1 200px',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'inherit',
    fontSize: 13,
};

const accentButton: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const ghostButton: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    cursor: 'pointer',
};

const formatPrice = (priceCents: number, currency: string): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(priceCents / 100);
    } catch {
        return `${(priceCents / 100).toFixed(2)} ${currency}`;
    }
};

const SOURCE_KINDS: { id: MigrationCreditSourceKind; label: string }[] = [
    { id: 'discord_migration', label: 'Discord' },
    { id: 'twitch_migration', label: 'Twitch' },
    { id: 'creator_invite', label: 'Creator invite' },
    { id: 'campaign', label: 'Campaign' },
];

/**
 * PR 7 minimum-viable creator-onboarding fork. Mounted at
 * `/onboarding/creator` and gated by `onboardingCreatorPath`. The
 * page is a stepper UI that explains the creator path + opens the
 * existing `startCreatorPayoutOnboarding` provider URL + lets the
 * creator import a migration credit (Discord/Twitch handle → FBM
 * coupon, deferred). A full Y-fork integration with the existing
 * `OnboardingFlow` state machine lands as a follow-up.
 */
export const CreatorOnboarding = (): JSX.Element => {
    const [providers, setProviders] = useState<{ id: string; displayName: string }[]>([]);
    const [credits, setCredits] = useState<MigrationCreditRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [sourceKind, setSourceKind] = useState<MigrationCreditSourceKind>('discord_migration');
    const [sourceHandle, setSourceHandle] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchCreatorProviders()
            .then((response) => {
                if (cancelled) return;
                setProviders(response.providers);
            })
            .catch(() => undefined);
        fetchMyMigrationCredits()
            .then((response) => {
                if (cancelled) return;
                setCredits(response.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const handleProviderOnboarding = async (providerId: string) => {
        setBusy(providerId);
        try {
            const handle = await startCreatorPayoutOnboarding(providerId, window.location.href);
            if (typeof handle.redirectUrl === 'string') {
                window.open(handle.redirectUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'onboarding failed');
        } finally {
            setBusy(null);
        }
    };

    const handleIssueCredit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy('issue-credit');
        try {
            const { credit } = await issueMigrationCredit({
                sourceKind,
                sourceHandle: sourceHandle.trim() || undefined,
                valueCents: 1000, // Default $10 starter; campaigns can override later.
            });
            setCredits((prev) => [credit, ...prev.filter((c) => c.id !== credit.id)]);
            setSourceHandle('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'credit issue failed');
        } finally {
            setBusy(null);
        }
    };

    const handleRedeemCredit = async (id: string) => {
        setBusy(`redeem-${id}`);
        try {
            const { credit } = await redeemMigrationCredit(id);
            setCredits((prev) => prev.map((c) => (c.id === credit.id ? credit : c)));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'redeem failed');
        } finally {
            setBusy(null);
        }
    };

    const liveProvider = useMemo(() => providers[0] ?? null, [providers]);

    return (
        <section style={layoutStyle} data-shell-region="creator-onboarding">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Become a creator</h1>
                <p style={subStyle}>
                    Set up your storefront, payout provider, and migration credits.
                </p>
            </header>
            <div style={stepperStyle}>
                {error ? (
                    <p
                        style={{ color: 'var(--text-danger, #f87171)', margin: 0, fontSize: 13 }}
                        data-testid="creator-onboarding-error"
                    >
                        {error}
                    </p>
                ) : null}

                <article style={stepCardStyle} data-testid="step-payout">
                    <span style={stepLabelStyle}>Step 1 · Payout</span>
                    <span style={stepTitleStyle}>Connect your seller account</span>
                    <span style={stepDescStyle}>
                        FreeBlackMarket handles checkout, payouts, and tax — no need to set up
                        Stripe yourself.
                    </span>
                    {liveProvider ? (
                        <button
                            type="button"
                            style={accentButton}
                            disabled={busy === liveProvider.id}
                            onClick={() => void handleProviderOnboarding(liveProvider.id)}
                            data-testid="step-payout-cta"
                        >
                            {busy === liveProvider.id
                                ? 'Opening…'
                                : `Onboard with ${liveProvider.displayName}`}
                        </button>
                    ) : (
                        <span style={stepDescStyle}>No payout providers available.</span>
                    )}
                </article>

                <article style={stepCardStyle} data-testid="step-listing">
                    <span style={stepLabelStyle}>Step 2 · First listing</span>
                    <span style={stepTitleStyle}>Publish your first product</span>
                    <span style={stepDescStyle}>
                        Drafts live in the Creator Listings page — open it once your payout account
                        is verified.
                    </span>
                    <Link
                        to={CREATOR_LISTINGS_PATH}
                        style={{ ...accentButton, textDecoration: 'none', textAlign: 'center' }}
                    >
                        Open Creator Listings
                    </Link>
                </article>

                <article style={stepCardStyle} data-testid="step-migration">
                    <span style={stepLabelStyle}>Step 3 · Migration credits</span>
                    <span style={stepTitleStyle}>Bring your audience from Discord / Twitch</span>
                    <span style={stepDescStyle}>
                        Import a handle from another platform to grant your existing community a
                        starter credit on FreeBlackMarket. The FBM coupon is settled in a follow-up
                        — for now we record the credit in the ledger and surface it below.
                    </span>
                    <form onSubmit={handleIssueCredit} style={formRow}>
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
                            data-testid="migration-handle-input"
                        />
                        <button
                            type="submit"
                            style={accentButton}
                            disabled={busy === 'issue-credit'}
                            data-testid="migration-issue-cta"
                        >
                            {busy === 'issue-credit' ? 'Issuing…' : 'Issue credit'}
                        </button>
                    </form>
                </article>

                {credits.length > 0 ? (
                    <article style={stepCardStyle} data-testid="migration-credits-list">
                        <span style={stepLabelStyle}>Your credits</span>
                        {credits.map((credit) => (
                            <div
                                key={credit.id}
                                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                data-testid="migration-credit-row"
                                data-credit-id={credit.id}
                                data-credit-redeemed={credit.redeemedAt ? 'true' : 'false'}
                            >
                                <span style={{ flex: 1, fontSize: 13 }}>
                                    {formatPrice(credit.valueCents, credit.currency)} ·{' '}
                                    {credit.sourceKind}
                                    {credit.sourceHandle ? ` · ${credit.sourceHandle}` : ''}
                                </span>
                                {credit.redeemedAt ? (
                                    <span style={stepDescStyle}>Redeemed</span>
                                ) : (
                                    <button
                                        type="button"
                                        style={ghostButton}
                                        disabled={busy === `redeem-${credit.id}`}
                                        onClick={() => void handleRedeemCredit(credit.id)}
                                    >
                                        Redeem
                                    </button>
                                )}
                            </div>
                        ))}
                    </article>
                ) : null}

                <p style={stepDescStyle}>
                    {BLACKOUT_TERMS.canopy.titlePlural} you create later inherit your creator
                    profile automatically.
                </p>
            </div>
        </section>
    );
};

export default CreatorOnboarding;
