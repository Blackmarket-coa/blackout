import { createElement } from 'react';

export const AppsSlice = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Surface app marketplace discovery with an explicit permission review before install.',
        ),
        createElement(
            'div',
            {
                style: {
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    background: 'var(--bg-input)',
                    padding: 10,
                    display: 'grid',
                    gap: 4,
                },
            },
            createElement('strong', undefined, 'Permission review checklist'),
            createElement('small', { style: { color: 'var(--text-secondary)' } }, 'Room read/write scope'),
            createElement('small', { style: { color: 'var(--text-secondary)' } }, 'Member profile access scope'),
            createElement('small', { style: { color: 'var(--text-secondary)' } }, 'Billing and renewal callback scope'),
        ),
    );
