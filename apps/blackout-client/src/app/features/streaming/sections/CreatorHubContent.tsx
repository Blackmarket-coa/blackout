import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    CONTENT_KINDS,
    DISTRIBUTION_TARGETS,
    type ContentKind,
    type CreatorContent,
    type DistributionTarget,
} from '@blackout/core';
import {
    createContent,
    distributeContent,
    fetchMyContent,
    publishContent,
    updateContent,
} from '../../creators/contentClient';

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const inputStyle: CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    cursor: 'pointer',
};

const ghostButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
};

const TARGET_LABEL: Record<DistributionTarget, string> = {
    home: 'Town Square',
    coliseum: 'Coliseum',
    coalition: 'Coalition',
    den: 'Den',
};

function ContentCard({ item, onChanged }: { item: CreatorContent; onChanged: () => void }) {
    const [target, setTarget] = useState<DistributionTarget>('coliseum');
    const [targetId, setTargetId] = useState('');
    const [busy, setBusy] = useState(false);

    const onPublish = useCallback(async () => {
        setBusy(true);
        try {
            await publishContent(item.id);
            onChanged();
        } finally {
            setBusy(false);
        }
    }, [item.id, onChanged]);

    const onArchive = useCallback(async () => {
        setBusy(true);
        try {
            await updateContent(item.id, { status: 'archived' });
            onChanged();
        } finally {
            setBusy(false);
        }
    }, [item.id, onChanged]);

    const onDistribute = useCallback(async () => {
        setBusy(true);
        try {
            await distributeContent(item.id, target, targetId.trim() || undefined);
            setTargetId('');
            onChanged();
        } finally {
            setBusy(false);
        }
    }, [item.id, target, targetId, onChanged]);

    return (
        <article style={cardStyle} data-testid="creator-content-card" data-content-id={item.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badgeStyle}>{item.kind}</span>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{item.title}</span>
                <span style={badgeStyle}>{item.status}</span>
            </div>
            {item.scheduledFor && item.status === 'scheduled' ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Scheduled for {new Date(item.scheduledFor).toLocaleString()}
                </span>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {item.status !== 'published' && item.status !== 'archived' ? (
                    <button type="button" style={buttonStyle} disabled={busy} onClick={onPublish}>
                        Publish now
                    </button>
                ) : null}
                {item.status !== 'archived' ? (
                    <button
                        type="button"
                        style={ghostButtonStyle}
                        disabled={busy}
                        onClick={onArchive}
                    >
                        Archive
                    </button>
                ) : null}
            </div>
            {item.status === 'published' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Distribute to
                    </span>
                    <select
                        value={target}
                        onChange={(event) => setTarget(event.target.value as DistributionTarget)}
                        style={{ ...inputStyle, width: 'auto' }}
                        aria-label="Distribution target"
                    >
                        {DISTRIBUTION_TARGETS.map((value) => (
                            <option key={value} value={value}>
                                {TARGET_LABEL[value]}
                            </option>
                        ))}
                    </select>
                    {target !== 'home' ? (
                        <input
                            value={targetId}
                            onChange={(event) => setTargetId(event.target.value)}
                            placeholder={`${TARGET_LABEL[target]} id`}
                            style={{ ...inputStyle, width: 180 }}
                        />
                    ) : null}
                    <button
                        type="button"
                        style={ghostButtonStyle}
                        disabled={busy}
                        onClick={onDistribute}
                    >
                        Add
                    </button>
                </div>
            ) : null}
        </article>
    );
}

export function CreatorHubContent() {
    const [items, setItems] = useState<CreatorContent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [kind, setKind] = useState<ContentKind>('video');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [busy, setBusy] = useState(false);

    const refetch = useCallback(() => {
        fetchMyContent()
            .then((res) => {
                setItems(res.content);
                setError(null);
            })
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load content')
            );
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const submit = useCallback(
        async (publishNow: boolean) => {
            const trimmed = title.trim();
            if (!trimmed || busy) return;
            setBusy(true);
            try {
                const scheduledIso =
                    scheduledFor && !publishNow ? new Date(scheduledFor).toISOString() : undefined;
                const { content } = await createContent({
                    kind,
                    title: trimmed,
                    body: body.trim() || undefined,
                    mediaUrl: mediaUrl.trim() || undefined,
                    scheduledFor: scheduledIso,
                });
                if (publishNow) await publishContent(content.id);
                setTitle('');
                setBody('');
                setMediaUrl('');
                setScheduledFor('');
                refetch();
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Failed to save content');
            } finally {
                setBusy(false);
            }
        },
        [kind, title, body, mediaUrl, scheduledFor, busy, refetch]
    );

    return (
        <section style={sectionStyle} data-testid="creator-hub-content">
            <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Content</h3>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Draft a video, article, or guide — publish it now or schedule it, then fan it
                    out to the Town Square, Coliseum, a Coalition, or a Den.
                </span>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <select
                        value={kind}
                        onChange={(event) => setKind(event.target.value as ContentKind)}
                        style={{ ...inputStyle, width: 'auto' }}
                        aria-label="Content kind"
                    >
                        {CONTENT_KINDS.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Title"
                        data-testid="creator-content-title"
                        style={inputStyle}
                    />
                </div>
                {kind === 'video' ? (
                    <input
                        value={mediaUrl}
                        onChange={(event) => setMediaUrl(event.target.value)}
                        placeholder="Video URL (mxc:// or https://)"
                        style={inputStyle}
                    />
                ) : (
                    <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Write your article or guide…"
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Schedule (optional)
                    </label>
                    <input
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(event) => setScheduledFor(event.target.value)}
                        style={{ ...inputStyle, width: 'auto' }}
                    />
                    <div style={{ flex: 1 }} />
                    <button
                        type="button"
                        style={ghostButtonStyle}
                        disabled={busy || title.trim().length === 0}
                        onClick={() => submit(false)}
                    >
                        {scheduledFor ? 'Schedule' : 'Save draft'}
                    </button>
                    <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy || title.trim().length === 0}
                        onClick={() => submit(true)}
                    >
                        Publish now
                    </button>
                </div>
            </div>

            {error ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div> : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        No content yet. Draft your first piece above.
                    </span>
                ) : (
                    items.map((item) => (
                        <ContentCard key={item.id} item={item} onChanged={refetch} />
                    ))
                )}
            </div>
        </section>
    );
}

export default CreatorHubContent;
