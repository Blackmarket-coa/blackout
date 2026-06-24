import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    PLAYBOOK_ACCENT_PALETTE,
    type GovernanceTreasuryMilestonePayload,
    type GovernanceTreasurySnapshotPayload,
    type PlaybookAccentToken,
} from '@blackout/protocol';
import { Thermometer } from '../../components/thermometer/Thermometer';
import {
    listTreasuryMilestones as listTreasuryMilestonesDefault,
    upsertTreasuryMilestone as upsertTreasuryMilestoneDefault,
} from './governanceClient';
import { balanceForAsset, milestoneProgress } from './treasuryProgress';

export interface TreasuryMilestonesProps {
    /** Latest treasury snapshot — supplies each milestone's current balance. */
    snapshot: GovernanceTreasurySnapshotPayload | null;
    listTreasuryMilestones?: typeof listTreasuryMilestonesDefault;
    upsertTreasuryMilestone?: typeof upsertTreasuryMilestoneDefault;
}

const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};

const fieldStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '6px 10px',
};

const btnStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '4px 10px',
    fontSize: 12,
};

const num = (value: number): string => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Community thermometers for treasury milestones: a shared goal (e.g. "fund the
 * commons to 50,000 USDC") rendered as a bar that fills with the treasury's
 * actual balance. Collective by nature — progress is the community balance vs.
 * the target, never anyone's individual contribution.
 */
export function TreasuryMilestones({
    snapshot,
    listTreasuryMilestones = listTreasuryMilestonesDefault,
    upsertTreasuryMilestone = upsertTreasuryMilestoneDefault,
}: TreasuryMilestonesProps) {
    const [milestones, setMilestones] = useState<GovernanceTreasuryMilestonePayload[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await listTreasuryMilestones();
            setMilestones(result.items);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Failed to load milestones.');
        } finally {
            setLoading(false);
        }
    }, [listTreasuryMilestones]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const save = useCallback(
        async (milestone: GovernanceTreasuryMilestonePayload) => {
            await upsertTreasuryMilestone(milestone);
            await refresh();
        },
        [upsertTreasuryMilestone, refresh],
    );

    return (
        <section style={{ display: 'grid', gap: 8 }} data-testid="treasury-milestones">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Community goals</strong>
                <button
                    type="button"
                    style={btnStyle}
                    onClick={() => setComposing((prev) => !prev)}
                    data-testid="treasury-milestone-toggle"
                >
                    {composing ? 'Close' : 'Add a goal'}
                </button>
            </div>

            {composing ? (
                <MilestoneComposer
                    assets={(snapshot?.lines ?? []).map((line) => line.asset)}
                    onCreate={async (input) => {
                        await save({
                            milestoneId: crypto.randomUUID(),
                            title: input.title,
                            asset: input.asset,
                            target: input.target,
                            status: 'active',
                            accent: input.accent,
                            createdAt: new Date().toISOString(),
                        });
                        setComposing(false);
                    }}
                />
            ) : null}

            {error ? (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>
                    {error}
                </p>
            ) : null}

            {milestones.map((milestone) => {
                const progress = milestoneProgress(
                    milestone.target,
                    balanceForAsset(snapshot, milestone.asset),
                );
                return (
                    <article key={milestone.milestoneId} style={cardStyle} data-testid="treasury-milestone">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong>{milestone.title}</strong>
                            {milestone.status === 'active' ? (
                                <button
                                    type="button"
                                    style={btnStyle}
                                    onClick={() =>
                                        void save({
                                            ...milestone,
                                            status: 'archived',
                                        })
                                    }
                                >
                                    Archive
                                </button>
                            ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {milestone.status}
                                </span>
                            )}
                        </div>
                        <Thermometer
                            percent={progress.percent}
                            accent={milestone.accent}
                            met={progress.met}
                            primaryLabel={`${num(progress.current)} / ${num(progress.target)} ${milestone.asset}`}
                            secondaryLabel={`${progress.percent}%`}
                            ariaLabel={`${num(progress.current)} of ${num(progress.target)} ${milestone.asset}`}
                            ariaValueNow={progress.current}
                            ariaValueMax={progress.target}
                        />
                    </article>
                );
            })}

            {!loading && milestones.length === 0 && !composing ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>
                    No community goals yet. Set one the whole co-op can fund together.
                </p>
            ) : null}
        </section>
    );
}

interface MilestoneComposerProps {
    assets: string[];
    onCreate: (input: {
        title: string;
        asset: string;
        target: number;
        accent: PlaybookAccentToken;
    }) => Promise<void>;
}

function MilestoneComposer({ assets, onCreate }: MilestoneComposerProps) {
    const [title, setTitle] = useState('');
    const [asset, setAsset] = useState(assets[0] ?? 'USDC');
    const [target, setTarget] = useState('');
    const [accent, setAccent] = useState<PlaybookAccentToken>('saffron');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        const parsedTarget = Number(target);
        const cleanAsset = (asset || '').trim();
        if (!title.trim()) {
            setErr('Give the goal a name.');
            return;
        }
        if (!cleanAsset) {
            setErr('Choose an asset.');
            return;
        }
        if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
            setErr('Target must be greater than zero.');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await onCreate({ title: title.trim(), asset: cleanAsset, target: parsedTarget, accent });
            setTitle('');
            setTarget('');
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={cardStyle} data-testid="treasury-milestone-composer">
            <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Goal — e.g. Seed the mutual-aid fund"
                style={fieldStyle}
                disabled={busy}
                data-testid="treasury-milestone-title"
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                    list="treasury-milestone-assets"
                    value={asset}
                    onChange={(event) => setAsset(event.target.value)}
                    placeholder="Asset (USDC)"
                    style={{ ...fieldStyle, flex: 1, minWidth: 90 }}
                    disabled={busy}
                    data-testid="treasury-milestone-asset"
                />
                <datalist id="treasury-milestone-assets">
                    {assets.map((option) => (
                        <option key={option} value={option} />
                    ))}
                </datalist>
                <input
                    type="number"
                    min={1}
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="Target (50000)"
                    style={{ ...fieldStyle, flex: 1, minWidth: 90 }}
                    disabled={busy}
                    data-testid="treasury-milestone-target"
                />
                <select
                    value={accent}
                    onChange={(event) => setAccent(event.target.value as PlaybookAccentToken)}
                    style={fieldStyle}
                    disabled={busy}
                >
                    {PLAYBOOK_ACCENT_PALETTE.map((token) => (
                        <option key={token} value={token}>
                            {token}
                        </option>
                    ))}
                </select>
            </div>
            {err ? (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>
                    {err}
                </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--accent-primary)',
                        color: 'var(--bg-surface)',
                        padding: '6px 12px',
                    }}
                    data-testid="treasury-milestone-create"
                >
                    {busy ? 'Adding…' : 'Add community goal'}
                </button>
            </div>
        </div>
    );
}

export default TreasuryMilestones;
