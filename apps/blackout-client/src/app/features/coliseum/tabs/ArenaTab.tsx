import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import {
    COLISEUM_TOPIC_CATEGORIES,
    challengeStatusLabel,
    type ColiseumMatch,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { EmptyState, Sheet } from '../../../../../../../packages/ui/src/primitives';
import { coliseumTabAtom, selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import { createColiseumMatch, fetchColiseumMatches } from '../coliseumMatchClient';
import { ColiseumFab } from '../components/ColiseumFab';
import { RelativeTime } from '../components/RelativeTime';
import * as ui from '../components/coliseumUi.css';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';

const inputStyle: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
};

const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };

const pillButton: CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
};

/** Full-height hero card gating entry into the arena. */
function EntryGate({ onEnter }: { onEnter: () => void }) {
    return (
        <div className={ui.feedColumn} style={{ justifyContent: 'center', minHeight: '100%' }}>
            <div
                className={ui.card}
                style={{ alignItems: 'center', textAlign: 'center', gap: 16, padding: '44px 24px' }}
            >
                <span aria-hidden style={{ fontSize: 44, lineHeight: 1 }}>
                    🏛️
                </span>
                <h2
                    style={{
                        margin: 0,
                        fontSize: 28,
                        fontWeight: 800,
                        letterSpacing: 2,
                        color: 'var(--accent-primary, #1ABC9C)',
                    }}
                >
                    THE COLISEUM
                </h2>
                <p
                    className={ui.mutedText}
                    style={{ margin: 0, maxWidth: 440, fontSize: 14, lineHeight: 1.55 }}
                >
                    Inside the arena, callouts and direct confrontation are the product — but every
                    fight is structured, every claim accountable, and every match ends in a
                    permanent public Brief. Conflict stays in the arena.
                </p>
                <button
                    type="button"
                    style={{ ...pillButton, fontSize: 15, padding: '12px 30px' }}
                    onClick={onEnter}
                    data-testid="coliseum-arena-enter"
                >
                    Enter the Arena
                </button>
            </div>
        </div>
    );
}

function MatchRow({ match, onOpen }: { match: ColiseumMatch; onOpen: (id: string) => void }) {
    return (
        <article className={ui.card} data-testid="coliseum-match-row" data-match-id={match.id}>
            <div className={ui.cardHeaderRow}>
                <span className={ui.tagChip} style={{ textTransform: 'uppercase' }}>
                    {match.status}
                </span>
                {match.domain ? <span className={ui.tagChip}>{match.domain}</span> : null}
                <span style={{ marginLeft: 'auto' }}>
                    <RelativeTime timestamp={match.createdAt} />
                </span>
            </div>
            <h3 className={ui.cardTitle}>{match.proposition}</h3>
            <span className={ui.mutedText}>
                {match.challengerId} vs{' '}
                {match.opponentId ?? (match.open ? 'Open challenge' : 'pending')}
            </span>
            <div className={ui.actionRow}>
                <button type="button" className={ui.actionButton} onClick={() => onOpen(match.id)}>
                    ⚔️ Open match →
                </button>
            </div>
        </article>
    );
}

/** Bottom-sheet form for issuing a Callout (was an inline card on this tab). */
function CalloutSheet({
    open,
    onClose,
    proposition,
    setProposition,
    opponentId,
    setOpponentId,
    domain,
    setDomain,
    busy,
    error,
    onCallout,
}: {
    open: boolean;
    onClose: () => void;
    proposition: string;
    setProposition: (value: string) => void;
    opponentId: string;
    setOpponentId: (value: string) => void;
    domain: ColiseumTopicCategoryKey | '';
    setDomain: (value: ColiseumTopicCategoryKey | '') => void;
    busy: boolean;
    error: string | null;
    onCallout: () => void;
}) {
    return (
        <Sheet open={open} onClose={onClose} title="Issue a Callout" className={coliseumSheetTheme}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Proposition</label>
                <input
                    value={proposition}
                    onChange={(e) => setProposition(e.target.value)}
                    placeholder="The proposition you're fighting for…"
                    maxLength={500}
                    style={inputStyle}
                    data-testid="coliseum-callout-proposition"
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={labelStyle}>Domain</label>
                        <select
                            value={domain}
                            onChange={(e) =>
                                setDomain(e.target.value as ColiseumTopicCategoryKey | '')
                            }
                            style={inputStyle}
                        >
                            <option value="">Any domain</option>
                            {COLISEUM_TOPIC_CATEGORIES.map((cat) => (
                                <option key={cat.key} value={cat.key}>
                                    {cat.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={labelStyle}>Opponent</label>
                        <input
                            value={opponentId}
                            onChange={(e) => setOpponentId(e.target.value)}
                            placeholder="@id (blank = Open Challenge)"
                            style={inputStyle}
                        />
                    </div>
                </div>
                {error ? (
                    <span role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>
                        {error}
                    </span>
                ) : null}
                <div style={{ marginTop: 4 }}>
                    <button
                        type="button"
                        style={{ ...pillButton, opacity: busy ? 0.6 : 1 }}
                        disabled={busy || proposition.trim().length === 0}
                        onClick={onCallout}
                    >
                        {busy ? 'Issuing…' : 'Issue Callout'}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

export function ArenaTab() {
    const [entered, setEntered] = useState(false);
    const [matches, setMatches] = useState<ColiseumMatch[]>([]);
    const [proposition, setProposition] = useState('');
    const [opponentId, setOpponentId] = useState('');
    const [domain, setDomain] = useState<ColiseumTopicCategoryKey | ''>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [calloutOpen, setCalloutOpen] = useState(false);
    const setTab = useSetAtom(coliseumTabAtom);
    const setSelectedMatch = useSetAtom(selectedColiseumMatchIdAtom);

    const load = useCallback(() => {
        fetchColiseumMatches({ limit: 50 })
            .then((res) => setMatches(res.matches))
            .catch(() => setMatches([]));
    }, []);

    useEffect(() => {
        if (entered) load();
    }, [entered, load]);

    const openMatch = useCallback(
        (id: string) => {
            setSelectedMatch(id);
            setTab('match');
        },
        [setSelectedMatch, setTab]
    );

    const onCallout = useCallback(async () => {
        const text = proposition.trim();
        if (!text || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await createColiseumMatch({
                proposition: text,
                domain: domain || undefined,
                opponentId: opponentId.trim() || undefined,
                open: opponentId.trim().length === 0,
            });
            setProposition('');
            setOpponentId('');
            setCalloutOpen(false);
            load();
            openMatch(res.match.id);
        } catch {
            setError('Could not issue the Callout. You may be within the 48-hour cool-down.');
        } finally {
            setBusy(false);
        }
    }, [proposition, opponentId, domain, busy, load, openMatch]);

    if (!entered) return <EntryGate onEnter={() => setEntered(true)} />;

    return (
        <div data-testid="coliseum-arena-tab" style={{ minHeight: '100%' }}>
            <div className={ui.feedColumn}>
                {matches.length === 0 ? (
                    <EmptyState
                        title="No matches yet"
                        description="Call someone out — or throw an Open Challenge — and settle it in front of the crowd."
                        action={
                            <button
                                type="button"
                                className={ui.chipActive}
                                onClick={() => setCalloutOpen(true)}
                            >
                                Issue the first Callout
                            </button>
                        }
                    />
                ) : (
                    matches.map((m) => <MatchRow key={m.id} match={m} onOpen={openMatch} />)
                )}
                <span className={ui.mutedText} style={{ fontSize: 11 }}>
                    Open challenge statuses are public: {challengeStatusLabel('seen')} and{' '}
                    {challengeStatusLabel('declined')} are visible to everyone.
                </span>
            </div>

            <ColiseumFab
                label="Issue a Callout"
                data-testid="coliseum-new-callout"
                onClick={() => setCalloutOpen(true)}
            />
            <CalloutSheet
                open={calloutOpen}
                onClose={() => setCalloutOpen(false)}
                proposition={proposition}
                setProposition={setProposition}
                opponentId={opponentId}
                setOpponentId={setOpponentId}
                domain={domain}
                setDomain={setDomain}
                busy={busy}
                error={error}
                onCallout={() => void onCallout()}
            />
        </div>
    );
}

export default ArenaTab;
