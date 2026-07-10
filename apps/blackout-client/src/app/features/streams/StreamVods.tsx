import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createClipFromSession, fetchStreamVods, type StreamVod } from './streamsClient';

/**
 * "Past broadcasts" (VOD) list for a stream, mounted under the player in the
 * LivestreamViewer. Reads `GET /v1/streaming/streams/:id/vods`. Renders
 * nothing when the stream has no replayable past broadcasts, so it's safe to
 * always mount. When the viewer owns the stream (`canClip`), each replay
 * gains a "Clip" affordance that cuts a segment server-side out of the
 * session recording and registers it in the Clips directory.
 */

const wrapStyle: CSSProperties = {
    padding: '8px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary, #f8fafc)',
};

const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
    fontSize: 13,
};

const clipButtonStyle: CSSProperties = {
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    cursor: 'pointer',
};

const clipFormStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 8,
    padding: '8px 12px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 8,
    fontSize: 12,
};

const clipInputStyle: CSSProperties = {
    padding: '4px 8px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 6,
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
};

const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
};

const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

const ClipCutForm = ({
    streamId,
    sessionId,
}: {
    streamId: string;
    sessionId: string;
}): JSX.Element => {
    const [title, setTitle] = useState('');
    const [startSeconds, setStartSeconds] = useState('0');
    const [durationSeconds, setDurationSeconds] = useState('60');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const start = Number(startSeconds);
        const duration = Number(durationSeconds);
        if (!title.trim() || !Number.isFinite(start) || start < 0) {
            setMessage('Give the clip a title and a start offset (seconds).');
            return;
        }
        if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
            setMessage('Duration must be 1–180 seconds.');
            return;
        }
        setSubmitting(true);
        setMessage(null);
        try {
            await createClipFromSession(streamId, sessionId, {
                title: title.trim(),
                startSeconds: start,
                durationSeconds: duration,
            });
            setMessage('Clip created — it now shows in your Clips tab.');
            setTitle('');
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Could not cut the clip.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form style={clipFormStyle} onSubmit={submit} data-testid="stream-vod-clip-form">
            <label style={{ display: 'grid', gap: 2 }}>
                Title
                <input
                    style={{ ...clipInputStyle, width: 160 }}
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    placeholder="Best moment"
                />
            </label>
            <label style={{ display: 'grid', gap: 2 }}>
                Start (s)
                <input
                    style={{ ...clipInputStyle, width: 70 }}
                    type="number"
                    min="0"
                    value={startSeconds}
                    onChange={(e) => setStartSeconds(e.currentTarget.value)}
                />
            </label>
            <label style={{ display: 'grid', gap: 2 }}>
                Length (s)
                <input
                    style={{ ...clipInputStyle, width: 70 }}
                    type="number"
                    min="1"
                    max="180"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.currentTarget.value)}
                />
            </label>
            <button type="submit" style={clipButtonStyle} disabled={submitting}>
                {submitting ? 'Cutting…' : 'Cut clip'}
            </button>
            {message ? (
                <span
                    style={{ color: 'var(--text-muted, #9ca3af)' }}
                    data-testid="stream-vod-clip-message"
                >
                    {message}
                </span>
            ) : null}
        </form>
    );
};

export const StreamVods = ({
    streamId,
    canClip = false,
}: {
    streamId: string;
    /** True when the signed-in viewer owns the stream — shows the Clip cutter. */
    canClip?: boolean;
}): JSX.Element | null => {
    const [vods, setVods] = useState<StreamVod[]>([]);
    const [clippingId, setClippingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchStreamVods(streamId)
            .then((res) => {
                if (!cancelled) setVods(res.items);
            })
            .catch(() => {
                /* non-fatal: no past-broadcasts section */
            });
        return () => {
            cancelled = true;
        };
    }, [streamId]);

    if (vods.length === 0) return null;

    return (
        <div style={wrapStyle} data-testid="stream-vods">
            <h2 style={headingStyle}>Past broadcasts</h2>
            {vods.map((vod) => {
                const duration = formatDuration(vod.durationSeconds);
                return (
                    <div key={vod.id} style={{ display: 'grid', gap: 6 }}>
                        <a
                            href={vod.replayPointer}
                            style={itemStyle}
                            data-testid="stream-vod-item"
                            data-vod-id={vod.id}
                        >
                            <span>{formatDate(vod.startedAt)}</span>
                            <span
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    color: 'var(--text-muted, #9ca3af)',
                                }}
                            >
                                {duration ? <span>{duration}</span> : null}
                                {canClip ? (
                                    <button
                                        type="button"
                                        style={clipButtonStyle}
                                        data-testid="stream-vod-clip-toggle"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setClippingId((prev) =>
                                                prev === vod.id ? null : vod.id
                                            );
                                        }}
                                    >
                                        ✂ Clip
                                    </button>
                                ) : null}
                            </span>
                        </a>
                        {canClip && clippingId === vod.id ? (
                            <ClipCutForm streamId={streamId} sessionId={vod.id} />
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
};

export default StreamVods;
