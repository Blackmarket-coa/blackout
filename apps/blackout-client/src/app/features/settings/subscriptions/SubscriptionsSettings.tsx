import React, { useCallback, useEffect, useState } from 'react';
import { BlackoutSdkError } from '@blackout/sdk';
import {
    createManageBillingSession,
    fetchMySubscription,
    type SubscriptionSummary,
} from '../../monetization/subscriptions/subscriptionsClient';
import { creatorSubsApi, type CreatorSubscription } from '../../monetization/monetizationApi';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import { useExternalPurchasePolicy } from '../../../hooks/useExternalPurchasePolicy';
import {
    openExternalCheckoutUrl,
    resolveCheckoutReturnUrl,
} from '../../../../platform/external-purchase';
import { isAllowedManageBillingUrl } from './manageBillingLink';

/** Registry `uiEntry` testid: `settings_toggle:feature-toggle-account-subscriptions-manage`. */
export const MANAGE_BILLING_TESTID = 'feature-toggle-account-subscriptions-manage';

const TIER_LABELS: Record<SubscriptionSummary['tier'], string> = {
    free: 'Free',
    sprout: 'Sprout',
    canopy_pro: 'Canopy Pro',
};

const STATUS_LABELS: Record<SubscriptionSummary['status'], string> = {
    trialing: 'Trial',
    active: 'Active',
    past_due: 'Payment overdue',
    canceled: 'Canceled',
};

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 14px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 14,
    display: 'grid',
    gap: 8,
};

const formatDate = (iso: string | null): string | null => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

type LoadState<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error' };

type ManageState =
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'opened'; url: string; expiresAt: string; outcome: 'opened' | 'unconfirmed' }
    | { kind: 'error'; message: string };

const manageErrorMessage = (error: unknown): string => {
    const status = error instanceof BlackoutSdkError ? error.status : undefined;
    if (status === 503) return 'Billing management is not available yet.';
    if (status === 409) {
        return 'More than one Free Black Market billing account matches this account. Contact support.';
    }
    return 'Free Black Market did not return a management link. Try again later.';
};

/**
 * Settings -> Subscriptions. Read-only on the Blackout side: shows the plan and
 * creator subscriptions Blackout has on record, and links out to Free Black
 * Market's hosted page for renewal and cancellation. Nothing here changes
 * billing directly.
 */
export const SubscriptionsSettings: React.FC = () => {
    const policy = useExternalPurchasePolicy();
    const [plan, setPlan] = useState<LoadState<SubscriptionSummary>>({ kind: 'loading' });
    const [creatorSubs, setCreatorSubs] = useState<LoadState<CreatorSubscription[]>>({
        kind: 'loading',
    });
    const [manage, setManage] = useState<ManageState>({ kind: 'idle' });

    const load = useCallback(async () => {
        const [planResult, subsResult] = await Promise.allSettled([
            fetchMySubscription(),
            creatorSubsApi.listMySubscriptions(readBlackoutApiToken()),
        ]);
        setPlan(
            planResult.status === 'fulfilled'
                ? { kind: 'ready', value: planResult.value }
                : { kind: 'error' }
        );
        setCreatorSubs(
            subsResult.status === 'fulfilled'
                ? { kind: 'ready', value: subsResult.value.subscriptions }
                : { kind: 'error' }
        );
    }, []);

    useEffect(() => {
        load();
        // Coming back from the FBM tab: re-read what Blackout has on record.
        // A change made on FBM reaches Blackout by webhook, so it may not be
        // here yet even after a refresh.
        const onFocus = () => {
            load();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [load]);

    const handleManage = async () => {
        setManage({ kind: 'busy' });
        let session: { url: string; expiresAt: string };
        try {
            // Only the app origin, never the current href: the page URL carries
            // the open space, room and event ids, and FBM has no business with
            // them. The API enforces the same (it keeps origin + "/" only).
            session = await createManageBillingSession(
                resolveCheckoutReturnUrl(`${window.location.origin}/`)
            );
        } catch (error) {
            setManage({ kind: 'error', message: manageErrorMessage(error) });
            return;
        }
        if (!isAllowedManageBillingUrl(session.url)) {
            setManage({
                kind: 'error',
                message:
                    'The billing link did not point at Free Black Market, so it was not opened.',
            });
            return;
        }
        const outcome = await openExternalCheckoutUrl(session.url);
        // `window.open` with noopener reports nothing back even when the tab
        // opened, so a "failed" outcome on the web is not proof of failure.
        // Either way, offer the link itself.
        setManage({
            kind: 'opened',
            url: session.url,
            expiresAt: session.expiresAt,
            outcome: outcome === 'failed' ? 'unconfirmed' : 'opened',
        });
    };

    const renderPlan = () => {
        if (plan.kind === 'loading') return <p>Loading your plan…</p>;
        if (plan.kind === 'error') return <p>Your plan could not be loaded.</p>;
        const value = plan.value;
        const periodEnd = formatDate(value.currentPeriodEndsAt);
        return (
            <div style={cardStyle} data-testid="account-subscriptions-plan">
                <strong>{TIER_LABELS[value.tier] ?? value.tier}</strong>
                {value.tier !== 'free' ? (
                    <span>Status: {STATUS_LABELS[value.status] ?? value.status}</span>
                ) : null}
                {periodEnd && value.tier !== 'free' ? (
                    <span>Current period ends {periodEnd}</span>
                ) : null}
                {value.comped ? (
                    <small>
                        This access was given as a gift or by an administrator. It is not billed
                        through Free Black Market and does not appear there.
                    </small>
                ) : null}
            </div>
        );
    };

    const renderCreatorSubs = () => {
        if (creatorSubs.kind === 'loading') return <p>Loading creator subscriptions…</p>;
        if (creatorSubs.kind === 'error') {
            return <p>Your creator subscriptions could not be loaded.</p>;
        }
        if (creatorSubs.value.length === 0) return <p>No creator subscriptions.</p>;
        return (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                {creatorSubs.value.map((sub) => {
                    const periodEnd = formatDate(sub.currentPeriodEndsAt);
                    return (
                        <li key={sub.id} data-testid="account-subscriptions-creator-sub">
                            {sub.creatorUserId} · {sub.status}
                            {periodEnd ? ` · current period ends ${periodEnd}` : ''}
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <div style={{ display: 'grid', gap: 16 }} data-testid="account-subscriptions">
            <header style={{ display: 'grid', gap: 6 }}>
                <h3 style={{ margin: 0 }}>Subscriptions</h3>
                <p style={{ margin: 0, opacity: 0.85 }}>
                    Paid plans and creator subscriptions are billed by Free Black Market. Free Black
                    Market sees your Blackout user ID and your billing details, and its card
                    processor sees your card.
                </p>
            </header>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Plan</h4>
                {renderPlan()}
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Creator subscriptions</h4>
                {renderCreatorSubs()}
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Renewal and cancellation</h4>
                {policy.allowed ? (
                    <>
                        <p style={{ margin: 0 }}>
                            Turn off automatic renewal or cancel on Free Black Market. The page is
                            hosted by Free Black Market, not Blackout, and the link expires after a
                            short time. Changes reach Blackout from Free Black Market and may not
                            show here right away.
                        </p>
                        <div>
                            <button
                                type="button"
                                style={buttonStyle}
                                data-testid={MANAGE_BILLING_TESTID}
                                disabled={manage.kind === 'busy'}
                                onClick={handleManage}
                            >
                                {manage.kind === 'busy'
                                    ? 'Opening Free Black Market…'
                                    : 'Manage billing on Free Black Market'}
                            </button>
                        </div>
                    </>
                ) : (
                    <p style={{ margin: 0 }} data-testid="account-subscriptions-manage-unavailable">
                        Billing management is not available in this app on this device.
                    </p>
                )}
                {manage.kind === 'error' ? (
                    <p role="alert" style={{ margin: 0 }}>
                        {manage.message}
                    </p>
                ) : null}
                {manage.kind === 'opened' ? (
                    <p role="status" style={{ margin: 0 }}>
                        {manage.outcome === 'opened'
                            ? 'Free Black Market opened. '
                            : 'If Free Black Market did not open, use this link: '}
                        <a
                            href={manage.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="account-subscriptions-manage-link"
                        >
                            Open Free Black Market
                        </a>
                        {formatDate(manage.expiresAt)
                            ? ` (link expires ${formatDate(manage.expiresAt)})`
                            : ''}
                    </p>
                ) : null}
            </section>
        </div>
    );
};

export default SubscriptionsSettings;
