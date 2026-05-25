import React, { useEffect, useState, type CSSProperties } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ReputationProfile,
    type ReputationSubject,
} from '@blackout/core';
import { fetchReputation } from './profileClient';

export interface ProfileReputationProps {
    userId: string;
    /** When provided, renders directly without fetching (used by tests). */
    reputation?: ReputationProfile;
}

const SUBJECT_LABEL: Record<string, string> = Object.fromEntries(
    COLISEUM_TOPIC_CATEGORIES.map((category) => [category.key, category.label])
);

const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    fontSize: 12,
};

function subjectLabel(subject: string): string {
    return SUBJECT_LABEL[subject] ?? subject;
}

export function ProfileReputation({ userId, reputation }: ProfileReputationProps) {
    const [data, setData] = useState<ReputationProfile | null>(reputation ?? null);

    useEffect(() => {
        if (reputation) {
            setData(reputation);
            return;
        }
        let active = true;
        fetchReputation(userId)
            .then((response) => {
                if (active) setData(response.reputation);
            })
            .catch(() => {
                if (active) setData(null);
            });
        return () => {
            active = false;
        };
    }, [userId, reputation]);

    if (!data || data.overall.score <= 0) {
        return (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                No reputation earned yet.
            </p>
        );
    }

    const subjects = Object.entries(data.bySubject).sort(
        ([, a], [, b]) => (b?.score ?? 0) - (a?.score ?? 0)
    );

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            data-testid="profile-reputation"
        >
            <div style={{ fontSize: 13 }}>
                Overall: <strong>{data.overall.score}</strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>· {data.overall.tier}</span>
            </div>
            {subjects.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {subjects.map(([subject, standing]) => (
                        <span
                            key={subject}
                            style={chipStyle}
                            data-subject={subject}
                            title={`${standing?.tier ?? ''}`}
                        >
                            <span style={{ fontWeight: 600 }}>
                                {subjectLabel(subject as ReputationSubject)}
                            </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{standing?.score}</span>
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default ProfileReputation;
