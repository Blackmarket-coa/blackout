import React, { type CSSProperties } from 'react';
import type { ProfileStatus } from './profileTypes';

export interface ProfileStatusBarProps {
    status?: ProfileStatus;
    /** Pass Date.now() in tests for deterministic expiry checks. */
    nowMs?: number;
}

const containerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    borderRadius: 999,
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    fontSize: 13,
    color: 'var(--text-primary)',
};

const expiryStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-secondary)',
};

function isExpired(status: ProfileStatus, nowMs: number): boolean {
    if (!status.expiresAt) return false;
    const expires = Date.parse(status.expiresAt);
    return !Number.isNaN(expires) && nowMs >= expires;
}

export function ProfileStatusBar({ status, nowMs = Date.now() }: ProfileStatusBarProps) {
    if (!status || isExpired(status, nowMs)) return null;
    return (
        <div style={containerStyle} role="status">
            {status.emoji ? <span aria-hidden>{status.emoji}</span> : null}
            <span>{status.text}</span>
            {status.expiresAt ? (
                <span style={expiryStyle}>
                    until {new Date(status.expiresAt).toLocaleTimeString()}
                </span>
            ) : null}
        </div>
    );
}

export default ProfileStatusBar;
