import React from 'react';
import * as css from './coliseumUi.css';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Compact Twitter-style relative timestamp ("now", "5m", "3h", "2d", "4w"). */
export function formatRelativeTime(timestampMs: number, nowMs = Date.now()): string {
    const delta = Math.max(0, nowMs - timestampMs);
    if (delta < MINUTE) return 'now';
    if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
    if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
    if (delta < 4 * WEEK) {
        return delta < WEEK ? `${Math.floor(delta / DAY)}d` : `${Math.floor(delta / WEEK)}w`;
    }
    return new Date(timestampMs).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

export function RelativeTime({ timestamp }: { timestamp: string | number }) {
    const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (Number.isNaN(ms)) return null;
    return (
        <time className={css.authorMeta} dateTime={new Date(ms).toISOString()}>
            {formatRelativeTime(ms)}
        </time>
    );
}

export default RelativeTime;
