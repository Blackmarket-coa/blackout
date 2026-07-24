import React, { useEffect, useState, type CSSProperties } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ReputationProfile,
    type ReputationSubject,
} from '@blackout/core';
import { fetchReputation, type ArenaTrackRecord } from './profileClient';

export interface ProfileReputationProps {
    userId: string;
    /** When provided, renders directly without fetching (used by tests). */
    reputation?: ReputationProfile;
    /** When provided alongside `reputation`, renders the arena record directly. */
    record?: ArenaTrackRecord;
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

const hasArenaEntries = (record: ArenaTrackRecord): boolean =>
    record.matchesWon > 0 ||
    record.matchesDrawn > 0 ||
    record.briefsAuthored > 0 ||
    record.steelmansPassed > 0 ||
    record.credibilityStrikes > 0;

/**
 * The literal Coliseum track record — a status layer of raw counts (matches
 * won/drawn, Briefs fought, steel-mans passed, credibility strikes) shown
 * alongside the scored standings.
 */
function ArenaRecordRow({ record }: { record: ArenaTrackRecord }) {
    return (
        <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            data-testid="profile-arena-record"
        >
            <span style={chipStyle} title="Coliseum matches won / drawn">
                <span aria-hidden>⚔️</span>
                <span style={{ fontWeight: 600 }}>
                    {record.matchesWon}W · {record.matchesDrawn}D
                </span>
            </span>
            <span style={chipStyle} title="Permanent Briefs this fighter appears in">
                <span aria-hidden>📜</span>
                <span style={{ fontWeight: 600 }}>{record.briefsAuthored}</span>
                <span style={{ color: 'var(--text-secondary)' }}>Briefs</span>
            </span>
            {record.steelmansPassed > 0 ? (
                <span style={chipStyle} title="Steel-man rounds the crowd endorsed">
                    <span aria-hidden>🛡️</span>
                    <span style={{ fontWeight: 600 }}>{record.steelmansPassed}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>steel-mans</span>
                </span>
            ) : null}
            {record.credibilityStrikes > 0 ? (
                <span style={chipStyle} title="Credibility strikes — evidence rulings against">
                    <span aria-hidden>⚠️</span>
                    <span style={{ fontWeight: 600 }}>{record.credibilityStrikes}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>strikes</span>
                </span>
            ) : null}
        </div>
    );
}

export function ProfileReputation({ userId, reputation, record }: ProfileReputationProps) {
    const [data, setData] = useState<ReputationProfile | null>(reputation ?? null);
    const [arenaRecord, setArenaRecord] = useState<ArenaTrackRecord | null>(record ?? null);

    useEffect(() => {
        if (reputation) {
            setData(reputation);
            setArenaRecord(record ?? null);
            return;
        }
        let active = true;
        fetchReputation(userId)
            .then((response) => {
                if (!active) return;
                setData(response.reputation);
                setArenaRecord(response.record ?? null);
            })
            .catch(() => {
                if (active) setData(null);
            });
        return () => {
            active = false;
        };
    }, [userId, reputation, record]);

    const showRecord = arenaRecord && hasArenaEntries(arenaRecord);

    if (!data || (data.overall.score <= 0 && !showRecord)) {
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
            {showRecord ? <ArenaRecordRow record={arenaRecord} /> : null}
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
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {standing?.score}
                            </span>
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default ProfileReputation;
