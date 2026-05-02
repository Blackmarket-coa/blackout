import React, { type CSSProperties } from 'react';
import type { ProfilePinnedMedia } from './profileTypes';

export interface PinnedMediaShelfProps {
    pinnedMedia?: ProfilePinnedMedia[];
    /**
     * Resolver from `mxc://` URI to a fetchable URL. The Matrix client SDK
     * supplies one in the live app; for demo/test contexts we fall back to
     * the raw mxc URI.
     */
    resolveMxc?: (mxc: string) => string;
}

const shelfStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const itemStyle: CSSProperties = {
    display: 'flex',
    gap: 12,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
};

const labelStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 700,
};

function MediaItem({
    item,
    resolveMxc,
}: {
    item: ProfilePinnedMedia;
    resolveMxc: (mxc: string) => string;
}) {
    switch (item.kind) {
        case 'audio':
            return (
                <div style={itemStyle}>
                    <span style={labelStyle}>🎧 Audio</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.title ?? 'Untitled'}</div>
                        {item.artist ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {item.artist}
                            </div>
                        ) : null}
                        <audio controls preload="none" src={resolveMxc(item.mxc)} style={{ marginTop: 4 }} />
                    </div>
                </div>
            );
        case 'image':
            return (
                <div style={itemStyle}>
                    <span style={labelStyle}>🖼 Image</span>
                    <img
                        src={resolveMxc(item.mxc)}
                        alt={item.alt ?? ''}
                        style={{ maxWidth: '100%', borderRadius: 8 }}
                    />
                </div>
            );
        case 'video':
            return (
                <div style={itemStyle}>
                    <span style={labelStyle}>🎬 Video</span>
                    <video
                        src={resolveMxc(item.mxc)}
                        controls
                        preload="none"
                        style={{ maxWidth: '100%', borderRadius: 8 }}
                    />
                </div>
            );
        case 'article':
            return (
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...itemStyle, textDecoration: 'none' }}
                >
                    <span style={labelStyle}>📰 Article</span>
                    <span style={{ flex: 1 }}>{item.title ?? item.url}</span>
                </a>
            );
    }
}

export function PinnedMediaShelf({
    pinnedMedia,
    resolveMxc = (mxc) => mxc,
}: PinnedMediaShelfProps) {
    const items = pinnedMedia ?? [];
    if (items.length === 0) {
        return (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                No pinned media yet.
            </div>
        );
    }
    return (
        <div style={shelfStyle} data-testid="pinned-media-shelf">
            {items.map((item, index) => (
                <MediaItem key={index} item={item} resolveMxc={resolveMxc} />
            ))}
        </div>
    );
}

export default PinnedMediaShelf;
