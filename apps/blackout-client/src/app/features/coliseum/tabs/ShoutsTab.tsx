import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumShout,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { EmptyState, Sheet } from '@blackout/ui/primitives';
import { coliseumTabAtom, selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import {
    createColiseumShout,
    fetchColiseumShout,
    fetchColiseumShouts,
    graduateColiseumShout,
    postColiseumResponseDrop,
    type ShoutDetailResponse,
} from '../coliseumMatchClient';
import { AuthorLine } from '../components/AuthorLine';
import { ColiseumFab } from '../components/ColiseumFab';
import { HeatBadge } from '../components/HeatBadge';
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
        <article className={ui.card} data-testid="coliseum-shout" data-shout-id={shout.id}>
            <AuthorLine userId={shout.authorId} timestamp={shout.createdAt}>
                <span style={{ marginLeft: 'auto' }}>
                    <HeatBadge heat={shout.heat} />
                </span>
            </AuthorLine>
            {shout.domain ? (
                <div className={ui.tagRow}>
                    <span className={ui.tagChip}>{shout.domain}</span>
                </div>
            ) : null}
            <h3 className={ui.cardTitle}>{shout.body ?? 'Untitled shout'}</h3>
            <div className={ui.actionRow}>
                <button type="button" className={ui.actionButton} onClick={open}>
                    {detail ? '↻ Refresh' : '💬 Open thread'}
                </button>
                {detail?.bilateral ? (
                    <button
                        type="button"
                        className={ui.chipActive}
                        onClick={() => void onGraduate()}
                    >
                        ⚔️ Formalize into a Match
                    </button>
                ) : null}
            </div>
            {detail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.drops.length > 0 ? (
                        <div className={ui.threadChildren}>
                            {detail.drops.map((drop) => (
                                <div
                                    key={drop.id}
                                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                                >
                                    <AuthorLine userId={drop.authorId} timestamp={drop.createdAt}>
                                        <span className={ui.tagChip} style={{ marginLeft: 'auto' }}>
                                            #{drop.rank}
                                        </span>
                                    </AuthorLine>
                                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                                        {drop.body ?? '(video)'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <input
                            value={dropBody}
                            onChange={(e) => setDropBody(e.target.value)}
                            placeholder="Response…"
                            style={{ ...inputStyle, flex: 1, width: 'auto', minWidth: 120 }}
                        />
                        <input
                            value={dropMxc}
                            onChange={(e) => setDropMxc(e.target.value)}
                            placeholder="video mxc://…"
                            style={{ ...inputStyle, flex: 1, width: 'auto', minWidth: 120 }}
                        />
                        <button
                            type="button"
                            style={{
                                ...pillButton,
                                padding: '8px 16px',
                                opacity: isMxc(dropMxc) ? 1 : 0.6,
                            }}
                            disabled={!isMxc(dropMxc)}
                            onClick={() => void onDrop()}
                        >
                            Drop
                        </button>
                    </div>
                </div>
            ) : null}
        </article>
    );
}

/** Bottom-sheet composer for a new Shout (was an inline card on this tab). */
function ShoutComposerSheet({
    open,
    onClose,
    body,
    setBody,
    mxc,
    setMxc,
    domain,
    setDomain,
    onShout,
}: {
    open: boolean;
    onClose: () => void;
    body: string;
    setBody: (value: string) => void;
    mxc: string;
    setMxc: (value: string) => void;
    domain: ColiseumTopicCategoryKey | '';
    setDomain: (value: ColiseumTopicCategoryKey | '') => void;
    onShout: () => void;
}) {
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Shout into the wind"
            className={coliseumSheetTheme}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>What set you off?</label>
                <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="What set you off?"
                    style={inputStyle}
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
                        <label style={labelStyle}>Video</label>
                        <input
                            value={mxc}
                            onChange={(e) => setMxc(e.target.value)}
                            placeholder="video mxc://…"
                            style={inputStyle}
                        />
                    </div>
                </div>
                <div style={{ marginTop: 4 }}>
                    <button
                        type="button"
                        style={{ ...pillButton, opacity: isMxc(mxc) ? 1 : 0.6 }}
                        disabled={!isMxc(mxc)}
                        onClick={onShout}
                    >
                        Post Shout
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

export function ShoutsTab() {
    const [shouts, setShouts] = useState<ColiseumShout[]>([]);
    const [body, setBody] = useState('');
    const [mxc, setMxc] = useState('');
    const [domain, setDomain] = useState<ColiseumTopicCategoryKey | ''>('');
    const [composerOpen, setComposerOpen] = useState(false);
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
        setComposerOpen(false);
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
        <div data-testid="coliseum-shouts-tab" style={{ minHeight: '100%' }}>
            <div className={ui.feedColumn}>
                {shouts.length === 0 ? (
                    <EmptyState
                        title="No shouts yet"
                        description="Be the first into the wind — drop a video take and see who answers back."
                        action={
                            <button
                                type="button"
                                className={ui.chipActive}
                                onClick={() => setComposerOpen(true)}
                            >
                                Post a Shout
                            </button>
                        }
                    />
                ) : (
                    shouts.map((s) => <ShoutCard key={s.id} shout={s} onGraduated={onGraduated} />)
                )}
            </div>

            <ColiseumFab
                label="Post a Shout"
                data-testid="coliseum-new-shout"
                onClick={() => setComposerOpen(true)}
            />
            <ShoutComposerSheet
                open={composerOpen}
                onClose={() => setComposerOpen(false)}
                body={body}
                setBody={setBody}
                mxc={mxc}
                setMxc={setMxc}
                domain={domain}
                setDomain={setDomain}
                onShout={() => void onShout()}
            />
        </div>
    );
}

export default ShoutsTab;
