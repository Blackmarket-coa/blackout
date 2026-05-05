import React, { useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomNameAdapter as useRoomName } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useSpaceMemberStats, useWelcomeContent } from './useWelcome';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

export const WelcomeScreen = ({
    spaceId,
    onPickChannel,
    onJoinOrExplore,
    actionLabel = `Join ${BLACKOUT_TERMS.canopy.title}`,
}: {
    spaceId: string;
    onPickChannel?: (roomId: string) => void;
    onJoinOrExplore?: () => void;
    actionLabel?: string;
}) => {
    const client = useMatrixClient();
    const welcome = useWelcomeContent(spaceId);
    const spaceName = useRoomName(spaceId);
    const stats = useSpaceMemberStats(spaceId);

    const bannerUrl = useMemo(() => {
        if (!welcome.data.bannerMxcUrl) return null;
        return client.mxcUrlToHttp(welcome.data.bannerMxcUrl, 1600, 480, 'scale');
    }, [client, welcome.data.bannerMxcUrl]);

    return (
        <section style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 12 }}>
            <article
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: 'var(--bg-surface)',
                }}
            >
                {bannerUrl ? (
                    <img
                        src={bannerUrl}
                        alt={`${spaceName.data} ${BLACKOUT_TERMS.canopy.singular} banner`}
                        style={{ width: '100%', height: 240, objectFit: 'cover' }}
                    />
                ) : (
                    <div
                        style={{
                            height: 180,
                            background:
                                'linear-gradient(120deg, var(--accent-muted), var(--bg-nav))',
                        }}
                    />
                )}

                <div style={{ padding: 16 }}>
                    <h1 style={{ margin: 0 }}>
                        {welcome.data.title || `Welcome to ${spaceName.data}!`}
                    </h1>
                    <p
                        style={{
                            margin: '8px 0 0',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {welcome.data.description}
                    </p>

                    <div
                        style={{
                            marginTop: 10,
                            display: 'inline-flex',
                            gap: 10,
                            color: 'var(--text-secondary)',
                            fontSize: 13,
                        }}
                    >
                        <span>{stats.data.memberCount} members</span>
                        <span>{stats.data.onlineCount} online</span>
                    </div>

                    <div style={{ marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={onJoinOrExplore}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--accent-primary)',
                                color: 'var(--bg-surface)',
                                padding: '8px 12px',
                            }}
                        >
                            {actionLabel}
                        </button>
                    </div>
                </div>
            </article>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 14,
                    background: 'var(--bg-surface)',
                    padding: 12,
                }}
            >
                <h3 style={{ marginTop: 0 }}>Featured {BLACKOUT_TERMS.den.plural}</h3>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 10,
                    }}
                >
                    {welcome.data.featuredChannels.map((channel) => (
                        <button
                            key={channel.roomId}
                            type="button"
                            onClick={() => onPickChannel?.(channel.roomId)}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 12,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                textAlign: 'left',
                                padding: 10,
                                display: 'grid',
                                gap: 4,
                            }}
                        >
                            <strong>
                                <span style={{ marginRight: 6 }}>{channel.emoji}</span>
                                {channel.roomId}
                            </strong>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                {channel.description}
                            </span>
                        </button>
                    ))}

                    {!welcome.loading && welcome.data.featuredChannels.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                            No featured {BLACKOUT_TERMS.den.plural} configured yet.
                        </div>
                    ) : null}
                </div>
            </section>
        </section>
    );
};

export default WelcomeScreen;
