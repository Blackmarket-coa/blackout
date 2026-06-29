import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumShout,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { coliseumTabAtom, selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import {
    createColiseumShout,
    fetchColiseumShout,
    fetchColiseumShouts,
    graduateColiseumShout,
    postColiseumResponseDrop,
    type ShoutDetailResponse,
} from '../coliseumMatchClient';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const inputStyle: CSSProperties = {
    padding: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const primaryButton: CSSProperties = {
    padding: '8px 14px',
    border: '1px solid var(--accent-primary)',
    background: 'var(--accent-primary)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
};

const ghostButton: CSSProperties = {
    ...primaryButton,
    background: 'transparent',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-default)',
    fontWeight: 500,
};

// Phase 1 accepts an mxc reference for the video; the in-app recorder/upload
// pipeline (app/state/upload.ts) is wired in a follow-up.
function isMxc(value: string): boolean {
    return /^mxc:\/\/[^/]+\/[A-Za-z0-9_-]+$/.test(value);
}

function ShoutCard({
    shout,
    onGraduated,
}: {
    shout: ColiseumShout;
    onGraduated: (matchId: string) => void;
}) {
    const [detail, setDetail] = useState<ShoutDetailResponse | null>(null);
    const [dropBody, setDropBody] = useState('');
    const [dropMxc, setDropMxc] = useState('');

    const open = useCallback(() => {
        fetchColiseumShout(shout.id)
            .then(setDetail)
            .catch(() => setDetail(null));
    }, [shout.id]);

    const onDrop = useCallback(async () => {
        if (!isMxc(dropMxc)) return;
        await postColiseumResponseDrop(shout.id, {
            body: dropBody.trim() || undefined,
            media: { kind: 'video', mxc: dropMxc },
        }).catch(() => undefined);
        setDropBody('');
        setDropMxc('');
        open();
    }, [shout.id, dropBody, dropMxc, open]);

    const onGraduate = useCallback(async () => {
        const res = await graduateColiseumShout(shout.id).catch(() => null);
        if (res) onGraduated(res.match.id);
    }, [shout.id, onGraduated]);

    return (
        <article style={cardStyle} data-testid="coliseum-shout" data-shout-id={shout.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {shout.domain ? (
                    <span style={{ fontSize: 11, color: 'var(--border-active)' }}>
                        {shout.domain}
                    </span>
                ) : null}
                <span style={{ flex: 1, fontWeight: 600 }}>{shout.body ?? 'Untitled shout'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    🔥 {(shout.heat * 100).toFixed(0)}
                </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={ghostButton} onClick={open}>
                    {detail ? 'Refresh' : 'Open thread'}
                </button>
                {detail?.bilateral ? (
                    <button type="button" style={primaryButton} onClick={onGraduate}>
                        Formalize into a Match
                    </button>
                ) : null}
            </div>
            {detail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detail.drops.map((drop) => (
                        <div key={drop.id} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            #{drop.rank} · {drop.authorId}: {drop.body ?? '(video)'}
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            value={dropBody}
                            onChange={(e) => setDropBody(e.target.value)}
                            placeholder="Response…"
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                            value={dropMxc}
                            onChange={(e) => setDropMxc(e.target.value)}
                            placeholder="video mxc://…"
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                            type="button"
                            style={primaryButton}
                            disabled={!isMxc(dropMxc)}
                            onClick={onDrop}
                        >
                            Drop
                        </button>
                    </div>
                </div>
            ) : null}
        </article>
    );
}

export function ShoutsTab() {
    const [shouts, setShouts] = useState<ColiseumShout[]>([]);
    const [body, setBody] = useState('');
    const [mxc, setMxc] = useState('');
    const [domain, setDomain] = useState<ColiseumTopicCategoryKey | ''>('');
    const setTab = useSetAtom(coliseumTabAtom);
    const setSelectedMatch = useSetAtom(selectedColiseumMatchIdAtom);

    const load = useCallback(() => {
        fetchColiseumShouts()
            .then((res) => setShouts(res.shouts))
            .catch(() => setShouts([]));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onShout = useCallback(async () => {
        if (!isMxc(mxc)) return;
        await createColiseumShout({
            body: body.trim() || undefined,
            domain: domain || undefined,
            media: { kind: 'video', mxc },
        }).catch(() => undefined);
        setBody('');
        setMxc('');
        load();
    }, [body, mxc, domain, load]);

    const onGraduated = useCallback(
        (matchId: string) => {
            setSelectedMatch(matchId);
            setTab('match');
        },
        [setSelectedMatch, setTab]
    );

    return (
        <div style={containerStyle} data-testid="coliseum-shouts-tab">
            <section style={cardStyle}>
                <strong>Shout into the wind</strong>
                <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="What set you off?"
                    style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                    <select
                        value={domain}
                        onChange={(e) => setDomain(e.target.value as ColiseumTopicCategoryKey | '')}
                        style={{ ...inputStyle, flex: 1 }}
                    >
                        <option value="">Any domain</option>
                        {COLISEUM_TOPIC_CATEGORIES.map((cat) => (
                            <option key={cat.key} value={cat.key}>
                                {cat.label}
                            </option>
                        ))}
                    </select>
                    <input
                        value={mxc}
                        onChange={(e) => setMxc(e.target.value)}
                        placeholder="video mxc://…"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                </div>
                <button
                    type="button"
                    style={primaryButton}
                    disabled={!isMxc(mxc)}
                    onClick={onShout}
                >
                    Post Shout
                </button>
            </section>
            {shouts.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>
                    No shouts yet. Be the first into the wind.
                </p>
            ) : (
                shouts.map((s) => <ShoutCard key={s.id} shout={s} onGraduated={onGraduated} />)
            )}
        </div>
    );
}

export default ShoutsTab;
