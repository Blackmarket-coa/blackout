import type { ReactNode } from 'react';

export const SpeakingIndicator = ({
    speaking,
    audioLevel,
    showStateBadge = false,
    children,
}: {
    speaking: boolean;
    audioLevel: number;
    showStateBadge?: boolean;
    children: ReactNode;
}) => {
    const alpha = Math.max(0.2, Math.min(0.85, audioLevel));

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
            }}
        >
            <div
                style={{
                    display: 'inline-flex',
                    borderRadius: 999,
                    border: `2px solid ${
                        speaking ? `rgba(83, 240, 117, ${alpha})` : 'transparent'
                    }`,
                    boxShadow: speaking ? `0 0 0 3px rgba(83, 240, 117, ${alpha * 0.35})` : 'none',
                    transition: 'all .12s ease',
                }}
            >
                {children}
            </div>
            {showStateBadge ? (
                <span
                    style={{
                        fontSize: 10,
                        color: speaking ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 999,
                        padding: '1px 6px',
                    }}
                >
                    {speaking ? 'Speaking' : 'Idle'}
                </span>
            ) : null}
        </div>
    );
};

export default SpeakingIndicator;
