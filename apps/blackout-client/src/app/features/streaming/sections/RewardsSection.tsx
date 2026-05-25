import React, { type CSSProperties, useEffect, useState } from 'react';
import {
    completeQuest,
    fetchActiveQuests,
    fetchMyAmbassador,
    fetchMyMigrationCredits,
    fetchMyReferrals,
    redeemMigrationCredit,
    type AmbassadorRecord,
    type MigrationCreditRecord,
    type QuestDefinitionRecord,
    type ReferralRecord,
} from '../../growth';
import {
    HubSection,
    hubCardLabelStyle,
    hubCardMetaStyle,
    hubEmptyStyle,
    hubGridStyle,
} from '../components/HubSection';

const statCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};

const statValueStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

const actionButtonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    background: 'var(--accent-primary, #2EF2C5)',
    color: '#06231d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
};

const sectionTitleStyle: CSSProperties = { margin: '20px 0 10px', fontSize: 14, fontWeight: 700 };
const listStackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

const formatCents = (cents: number, currency: string): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
    }
};

const is403 = (err: unknown): boolean => (err as { status?: number } | null)?.status === 403;

/**
 * Creator Reward Program section. Surfaces the existing growth ledger
 * (referrals, ambassador tier, active quests, migration credits) as one
 * dashboard, with claim / redeem actions. The growth flags default off, so
 * a 403 from the first fetch degrades the whole section to a friendly
 * "not available yet" message rather than erroring (mirrors LiveDirectory).
 */
export const RewardsSection = (): JSX.Element => {
    const [ambassador, setAmbassador] = useState<AmbassadorRecord | null>(null);
    const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
    const [quests, setQuests] = useState<QuestDefinitionRecord[]>([]);
    const [credits, setCredits] = useState<MigrationCreditRecord[]>([]);
    const [forbidden, setForbidden] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchMyAmbassador()
            .then((response) => {
                if (!cancelled) setAmbassador(response.ambassador);
            })
            .catch((err) => {
                if (!cancelled && is403(err)) setForbidden(true);
            });
        fetchMyReferrals()
            .then((response) => {
                if (!cancelled) setReferrals(response.items);
            })
            .catch(() => undefined);
        fetchActiveQuests()
            .then((response) => {
                if (!cancelled) setQuests(response.items);
            })
            .catch(() => undefined);
        fetchMyMigrationCredits()
            .then((response) => {
                if (!cancelled) setCredits(response.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const claimQuest = (questId: string): void => {
        setBusyId(questId);
        completeQuest(questId)
            .then(() => {
                setQuests((prev) => prev.filter((quest) => quest.id !== questId));
            })
            .catch(() => undefined)
            .finally(() => setBusyId(null));
    };

    const redeemCredit = (creditId: string): void => {
        setBusyId(creditId);
        redeemMigrationCredit(creditId)
            .then((response) => {
                setCredits((prev) =>
                    prev.map((credit) => (credit.id === creditId ? response.credit : credit))
                );
            })
            .catch(() => undefined)
            .finally(() => setBusyId(null));
    };

    const pendingReferrals = referrals.filter(
        (referral) => referral.status === 'pending' || referral.status === 'attributed'
    );
    const unredeemedCredits = credits.filter((credit) => credit.redeemedAt === null);

    if (forbidden) {
        return (
            <HubSection title="Rewards" testId="rewards-section" shellRegion="rewards-section">
                <p style={hubEmptyStyle} data-testid="rewards-forbidden">
                    The creator reward program isn’t available on your account yet.
                </p>
            </HubSection>
        );
    }

    return (
        <HubSection
            title="Rewards"
            subtitle="Earn across the platform — referrals, ambassador tiers, quests, and migration credits."
            testId="rewards-section"
            shellRegion="rewards-section"
        >
            <div style={hubGridStyle} data-testid="rewards-stats">
                <div style={statCardStyle}>
                    <span style={hubCardLabelStyle}>Ambassador tier</span>
                    <span style={statValueStyle}>{ambassador?.tier ?? '—'}</span>
                    <span style={hubCardMetaStyle}>
                        {ambassador
                            ? `${(ambassador.commissionBps / 100).toFixed(1)}% commission · ${
                                  ambassador.status
                              }`
                            : 'Not enrolled yet'}
                    </span>
                </div>
                <div style={statCardStyle}>
                    <span style={hubCardLabelStyle}>Pending referrals</span>
                    <span style={statValueStyle}>{pendingReferrals.length}</span>
                    <span style={hubCardMetaStyle}>
                        {referrals.length === 0 ? 'No referrals yet' : `${referrals.length} total`}
                    </span>
                </div>
                <div style={statCardStyle}>
                    <span style={hubCardLabelStyle}>Migration credits</span>
                    <span style={statValueStyle}>{unredeemedCredits.length}</span>
                    <span style={hubCardMetaStyle}>
                        {unredeemedCredits.length === 0
                            ? 'Nothing to redeem'
                            : `${formatCents(
                                  unredeemedCredits.reduce((sum, c) => sum + c.valueCents, 0),
                                  unredeemedCredits[0]?.currency ?? 'USD'
                              )} unredeemed`}
                    </span>
                </div>
            </div>

            <h2 style={sectionTitleStyle}>Active quests</h2>
            {quests.length === 0 ? (
                <p style={hubEmptyStyle} data-testid="rewards-quests-empty">
                    No active quests right now.
                </p>
            ) : (
                <div style={listStackStyle} data-testid="rewards-quests">
                    {quests.map((quest) => (
                        <div key={quest.id} style={rowStyle} data-testid="rewards-quest-row">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <strong style={{ fontSize: 14 }}>{quest.title}</strong>
                                <span style={hubCardMetaStyle}>{quest.description}</span>
                            </div>
                            <button
                                type="button"
                                style={actionButtonStyle}
                                disabled={busyId === quest.id}
                                onClick={() => claimQuest(quest.id)}
                                data-testid="rewards-quest-claim"
                            >
                                {busyId === quest.id ? 'Claiming…' : 'Claim'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {unredeemedCredits.length > 0 ? (
                <>
                    <h2 style={sectionTitleStyle}>Migration credits</h2>
                    <div style={listStackStyle} data-testid="rewards-credits">
                        {unredeemedCredits.map((credit) => (
                            <div key={credit.id} style={rowStyle} data-testid="rewards-credit-row">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <strong style={{ fontSize: 14 }}>
                                        {formatCents(credit.valueCents, credit.currency)}
                                    </strong>
                                    <span style={hubCardMetaStyle}>{credit.sourceKind}</span>
                                </div>
                                <button
                                    type="button"
                                    style={actionButtonStyle}
                                    disabled={busyId === credit.id}
                                    onClick={() => redeemCredit(credit.id)}
                                    data-testid="rewards-credit-redeem"
                                >
                                    {busyId === credit.id ? 'Redeeming…' : 'Redeem'}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}
        </HubSection>
    );
};

export default RewardsSection;
