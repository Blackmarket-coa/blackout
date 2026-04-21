import { createElement } from 'react';

const questRows = [
    { title: 'Welcome streak', status: 'Completed', walletState: 'Reward settled' },
    { title: 'Creator referral', status: 'In progress', walletState: 'Pending validation' },
    { title: 'Seasonal challenge', status: 'Claimable', walletState: 'Ready to transfer' },
];

export const QuestsSlice = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Expose quest lifecycle states together with wallet-facing payout status.',
        ),
        createElement(
            'div',
            { style: { display: 'grid', gap: 8 } },
            ...questRows.map((quest) =>
                createElement(
                    'div',
                    {
                        key: quest.title,
                        style: {
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            background: 'var(--bg-input)',
                            padding: 10,
                            display: 'grid',
                            gap: 4,
                        },
                    },
                    createElement('strong', undefined, quest.title),
                    createElement('small', { style: { color: 'var(--text-secondary)' } }, `Lifecycle: ${quest.status}`),
                    createElement('small', { style: { color: 'var(--text-secondary)' } }, `Wallet: ${quest.walletState}`),
                ),
            ),
        ),
    );
