/**
 * What a stranger sees when they follow a shared campaign link.
 *
 * The funnel used to end here. The OG card was good, the redirect worked, and
 * then the router — which only mounts once logged in — dropped the visitor on
 * a card reading "Signed out / Sign in to start syncing with Matrix." The
 * campaign was never named. Someone who clicked because a coalition was fixing
 * a roof arrived at a generic sign-in prompt for a Matrix client.
 *
 * This renders the campaign instead: what it is, who is doing it, how far along
 * it is, and one way in. It reads the same unauthenticated endpoint the embed
 * widget uses, so there is one public projection of a campaign rather than two
 * that can disagree.
 *
 * **Attribution.** If the link carried a `ref`, it is stashed in
 * `sessionStorage` and replayed when the visitor signs up or joins — the same
 * shape the invite flow already uses. Nothing else is recorded: no cookie, no
 * IP, no fingerprint. A visitor who reads this page and leaves has left a `+1`
 * on a counter and nothing else, and the coalition is shown totals rather than
 * a list of who arrived.
 */
import { useEffect, useMemo, useState } from 'react';

const REF_STORAGE_KEY = 'blackout.coalition.ref';

export interface PublicCampaign {
    id: string;
    coalitionId: string;
    coalitionName: string;
    coalitionSlug: string;
    title: string;
    description: string;
    type: string;
    status: string;
    goalCents: number | null;
    raisedCents: number;
    contributorCount: number;
    currency: string;
    url: string;
}

/**
 * Stash the share token for the rest of this browser session.
 *
 * `sessionStorage`, not a cookie: it is not sent on every request, it does not
 * survive the tab closing, and it cannot be read cross-site. Wrapped because a
 * private window or blocked site data makes the accessor throw, and losing an
 * attribution statistic must never break the page.
 */
export function stashAttributionRef(ref: string | null): void {
    if (!ref) return;
    try {
        window.sessionStorage.setItem(REF_STORAGE_KEY, ref);
    } catch {
        // No storage, no attribution. The visitor is unaffected.
    }
}

/** Read back a stashed token, for the signup and join calls. */
export function readAttributionRef(): string | undefined {
    try {
        return window.sessionStorage.getItem(REF_STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

/** Drop it once it has been spent, so it cannot be counted twice. */
export function clearAttributionRef(): void {
    try {
        window.sessionStorage.removeItem(REF_STORAGE_KEY);
    } catch {
        // Nothing to clear.
    }
}

const money = (cents: number, currency: string): string =>
    new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0,
    }).format(cents / 100);

const PAGE: React.CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg, #0d0f12)',
    color: 'var(--fg, #e7e9ee)',
};

const CARD: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    display: 'grid',
    gap: 16,
    padding: 28,
    borderRadius: 16,
    border: '1px solid var(--border, #242830)',
    background: 'var(--surface, #14171c)',
};

const MUTED: React.CSSProperties = { color: 'var(--fg-muted, #9aa3b2)', fontSize: 14 };

const BUTTON: React.CSSProperties = {
    display: 'block',
    textAlign: 'center',
    padding: '12px 16px',
    borderRadius: 10,
    fontWeight: 600,
    textDecoration: 'none',
    background: 'var(--accent, #4f7cff)',
    color: '#fff',
};

const SECONDARY: React.CSSProperties = {
    ...BUTTON,
    background: 'transparent',
    color: 'var(--fg, #e7e9ee)',
    border: '1px solid var(--border, #242830)',
};

/** `/coalitions/:slug/c/:campaignId` for someone with no account. */
export function CampaignLandingPage() {
    const { slug, campaignId, ref } = useMemo(() => {
        const match = /^\/coalitions\/([^/]+)\/c\/([^/?#]+)/.exec(window.location.pathname);
        const params = new URLSearchParams(window.location.search);
        return {
            slug: match ? decodeURIComponent(match[1]) : null,
            campaignId: match ? decodeURIComponent(match[2]) : null,
            ref: params.get('ref'),
        };
    }, []);

    const [campaign, setCampaign] = useState<PublicCampaign | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        stashAttributionRef(ref);
    }, [ref]);

    useEffect(() => {
        if (!slug || !campaignId) {
            setFailed(true);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `/v1/coalitions/${encodeURIComponent(slug)}/campaigns/${encodeURIComponent(
                        campaignId
                    )}/public`
                );
                if (!res.ok) throw new Error(String(res.status));
                const body = (await res.json()) as { drive: PublicCampaign };
                if (!cancelled) setCampaign(body.drive);
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [slug, campaignId]);

    if (failed) {
        return (
            <div style={PAGE}>
                <div style={CARD}>
                    <strong style={{ fontSize: 20 }}>This campaign is not available</strong>
                    <span style={MUTED}>
                        It may have finished, or the coalition running it may have closed.
                    </span>
                    <a href="/explore" style={SECONDARY}>
                        Browse Blackout
                    </a>
                </div>
            </div>
        );
    }

    if (!campaign) {
        return (
            <div style={PAGE}>
                <div style={CARD}>
                    <span style={MUTED}>Loading…</span>
                </div>
            </div>
        );
    }

    const fraction =
        campaign.goalCents && campaign.goalCents > 0
            ? Math.min(1, campaign.raisedCents / campaign.goalCents)
            : null;

    return (
        <div style={PAGE}>
            <div style={CARD} data-testid="campaign-landing">
                <span style={MUTED}>{campaign.coalitionName}</span>
                <strong style={{ fontSize: 24, lineHeight: 1.25 }}>{campaign.title}</strong>
                {campaign.description ? (
                    <span style={{ ...MUTED, whiteSpace: 'pre-wrap', color: 'inherit' }}>
                        {campaign.description}
                    </span>
                ) : null}

                {fraction !== null ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                        <div
                            style={{
                                height: 8,
                                borderRadius: 999,
                                background: 'var(--border, #242830)',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${Math.round(fraction * 100)}%`,
                                    height: '100%',
                                    background: 'var(--accent, #4f7cff)',
                                }}
                            />
                        </div>
                        <span style={MUTED}>
                            {money(campaign.raisedCents, campaign.currency)} of{' '}
                            {money(campaign.goalCents ?? 0, campaign.currency)} ·{' '}
                            {campaign.contributorCount}{' '}
                            {campaign.contributorCount === 1 ? 'supporter' : 'supporters'}
                        </span>
                    </div>
                ) : (
                    <span style={MUTED}>
                        {campaign.contributorCount}{' '}
                        {campaign.contributorCount === 1 ? 'supporter' : 'supporters'} so far
                    </span>
                )}

                <div style={{ display: 'grid', gap: 8 }}>
                    <a href="/register" style={BUTTON}>
                        Join Blackout to support this
                    </a>
                    <a href="/login" style={SECONDARY}>
                        I already have an account
                    </a>
                </div>

                <span style={{ ...MUTED, fontSize: 12 }}>
                    Blackout is where this coalition organises. Making an account lets you
                    contribute, follow what happens next, and start something of your own.
                </span>
            </div>
        </div>
    );
}
