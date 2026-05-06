import { createElement, useEffect, useMemo, useState, type FormEvent } from 'react';
import { aidPoolsApi, formatCents, type AidPool } from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 8,
};

const buttonStyle: Record<string, string | number> = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

const inputStyle: Record<string, string | number> = {
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
};

function ProgressBar({ percent }: { percent: number }) {
    return createElement(
        'div',
        {
            style: {
                width: '100%',
                height: 8,
                background: 'var(--bg-input)',
                borderRadius: 999,
                overflow: 'hidden',
            },
        },
        createElement('div', {
            style: {
                width: `${percent}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 200ms ease',
            },
        })
    );
}

function PoolCard({
    pool,
    onContribute,
}: {
    pool: AidPool;
    onContribute: (poolId: string, amount: number, note: string | undefined) => Promise<void>;
}) {
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setConfirmation(null);
        const cents = Math.floor(Number(amount) * 100);
        if (!Number.isFinite(cents) || cents < 100) {
            setError('Minimum contribution is $1.00');
            return;
        }
        setSubmitting(true);
        try {
            await onContribute(pool.id, cents, note || undefined);
            setConfirmation(`Sent ${formatCents(cents)} to ${pool.title}.`);
            setAmount('');
            setNote('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not contribute.');
        } finally {
            setSubmitting(false);
        }
    }

    return createElement(
        'article',
        { style: cardStyle, 'data-testid': `pool-${pool.id}` },
        createElement(
            'header',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            createElement('strong', { style: { fontSize: 14 } }, pool.title),
            createElement(
                'span',
                { style: { fontSize: 11, color: 'var(--text-secondary)' } },
                pool.status === 'open' ? 'OPEN' : pool.status === 'fulfilled' ? 'FULFILLED' : 'CLOSED'
            )
        ),
        pool.description
            ? createElement(
                  'p',
                  { style: { fontSize: 12, color: 'var(--text-secondary)', margin: 0 } },
                  pool.description
              )
            : null,
        createElement(
            'div',
            { style: { display: 'grid', gap: 4 } },
            createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11 } },
                createElement(
                    'span',
                    undefined,
                    `${formatCents(pool.raisedCents, pool.currency)} of ${formatCents(pool.goalCents, pool.currency)}`
                ),
                createElement(
                    'span',
                    { style: { color: 'var(--text-secondary)' } },
                    `${pool.percent}% · ${pool.contributionCount} contributions · ${pool.uniqueContributorCount} donors`
                )
            ),
            createElement(ProgressBar, { percent: pool.percent })
        ),
        pool.status === 'open'
            ? createElement(
                  'form',
                  {
                      style: { display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr auto' },
                      onSubmit: submit,
                  },
                  createElement('input', {
                      type: 'number',
                      step: '0.01',
                      min: '1',
                      value: amount,
                      placeholder: 'Amount ($)',
                      style: inputStyle,
                      onChange: (e: { currentTarget: { value: string } }) =>
                          setAmount(e.currentTarget.value),
                  }),
                  createElement('input', {
                      type: 'text',
                      maxLength: 280,
                      value: note,
                      placeholder: 'Note (optional)',
                      style: inputStyle,
                      onChange: (e: { currentTarget: { value: string } }) =>
                          setNote(e.currentTarget.value),
                  }),
                  createElement(
                      'button',
                      { type: 'submit', style: buttonStyle, disabled: submitting },
                      submitting ? 'Sending…' : 'Contribute'
                  )
              )
            : null,
        error
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-danger)' } },
                  error
              )
            : null,
        confirmation
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-success)' } },
                  confirmation
              )
            : null
    );
}

function CreatePoolForm({ onCreated }: { onCreated: (pool: AidPool) => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [goal, setGoal] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        const cents = Math.floor(Number(goal) * 100);
        if (!Number.isFinite(cents) || cents < 100) {
            setError('Goal must be at least $1.00');
            return;
        }
        if (!title.trim()) {
            setError('Title is required.');
            return;
        }
        setSubmitting(true);
        try {
            const { pool } = await aidPoolsApi.create(
                {
                    title: title.trim(),
                    description: description || undefined,
                    goalCents: cents,
                    currency: 'USD',
                },
                token
            );
            onCreated(pool);
            setTitle('');
            setDescription('');
            setGoal('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create pool.');
        } finally {
            setSubmitting(false);
        }
    }

    return createElement(
        'form',
        { style: { ...cardStyle, gap: 6 }, onSubmit: submit },
        createElement('strong', { style: { fontSize: 13 } }, 'Organize an aid pool'),
        createElement('input', {
            type: 'text',
            value: title,
            placeholder: 'Title (e.g., Wildfire relief)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) => setTitle(e.currentTarget.value),
        }),
        createElement('input', {
            type: 'text',
            value: description,
            placeholder: 'Description (optional)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) =>
                setDescription(e.currentTarget.value),
        }),
        createElement('input', {
            type: 'number',
            step: '0.01',
            min: '1',
            value: goal,
            placeholder: 'Goal ($)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) => setGoal(e.currentTarget.value),
        }),
        error
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-danger)' } },
                  error
              )
            : null,
        createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end' } },
            createElement(
                'button',
                { type: 'submit', style: buttonStyle, disabled: submitting },
                submitting ? 'Creating…' : 'Create pool'
            )
        )
    );
}

export function AidPoolsSlice() {
    const [pools, setPools] = useState<AidPool[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    async function refresh() {
        try {
            const { pools: list } = await aidPoolsApi.list(token);
            setPools(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load aid pools.');
        }
    }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { pools: list } = await aidPoolsApi.list(token);
                if (!cancelled) setPools(list);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Could not load aid pools.');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    async function contribute(poolId: string, amount: number, note: string | undefined) {
        await aidPoolsApi.contribute(poolId, amount, note, token);
        await refresh();
    }

    return createElement(
        'section',
        { style: { display: 'grid', gap: 12 } },
        createElement(CreatePoolForm, {
            onCreated: (pool: AidPool) => setPools((prev) => (prev ? [pool, ...prev] : [pool])),
        }),
        error
            ? createElement('div', { style: { color: 'var(--text-danger)' } }, error)
            : null,
        pools === null
            ? createElement(
                  'div',
                  { style: { color: 'var(--text-secondary)' } },
                  'Loading aid pools…'
              )
            : pools.length === 0
              ? createElement(
                    'div',
                    { style: { color: 'var(--text-secondary)' } },
                    'No active pools yet. Be the first to organize one.'
                )
              : createElement(
                    'div',
                    { style: { display: 'grid', gap: 10 } },
                    ...pools.map((pool) =>
                        createElement(PoolCard, {
                            key: pool.id,
                            pool,
                            onContribute: contribute,
                        })
                    )
                )
    );
}
