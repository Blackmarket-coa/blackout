import { useEffect, useMemo, useState } from 'react';
import { describeDeadDropSchedule, getNextDeliveryDate, type DeadDropConfig } from './useDeadDrop';

const formatCountdown = (target: Date): string => {
    const ms = Math.max(0, target.getTime() - Date.now());
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
};

export const DeadDropIndicator = ({
    config,
    queueCount,
}: {
    config: DeadDropConfig;
    queueCount: number;
}) => {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, []);

    const nextDelivery = useMemo(() => {
        void now;
        return getNextDeliveryDate(config);
    }, [config, now]);
    const summary = useMemo(() => describeDeadDropSchedule(config), [config]);

    if (!config.enabled) return null;

    return (
        <aside
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                border: '1px solid var(--accent-primary)',
                borderRadius: 10,
                background: 'var(--bg-input)',
                padding: '6px 10px',
            }}
        >
            <strong>{summary}</strong>
            <span style={{ opacity: 0.9 }}>
                Next delivery: {nextDelivery ? formatCountdown(nextDelivery) : 'manual trigger'}
            </span>
            <span
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 999,
                    padding: '2px 8px',
                }}
            >
                Queue: {queueCount}
            </span>
        </aside>
    );
};

export default DeadDropIndicator;
