import { useCallback, useEffect, useState } from 'react';
import {
    fetchAssets,
    fetchMyAssets,
    submitAsset,
    type CommunityAsset,
    type CommunityAssetKind,
} from './assetsClient';

const KINDS: { id: CommunityAssetKind; label: string }[] = [
    { id: 'sticker', label: 'Stickers' },
    { id: 'meme', label: 'Memes' },
    { id: 'coin', label: 'Coins' },
];

/** Plain words for each review state, so a creator is never left guessing. */
const STATUS_COPY: Record<CommunityAsset['status'], string> = {
    pending: 'In review — not shared with anyone yet',
    approved: 'Approved',
    rejected: 'Not approved',
    retired: 'Retired — no longer shared',
};

const panel: React.CSSProperties = {
    display: 'grid',
    gap: 12,
    padding: 16,
};

const card: React.CSSProperties = {
    display: 'grid',
    gap: 4,
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--border-default)',
};

/**
 * Things people made, and the place to make one.
 *
 * The shelf is approved work only. Nothing is featured, promoted or ranked here
 * — an asset spreads by someone relaying it, like everything else — so this is a
 * directory rather than a storefront.
 */
export const AssetShelf = (): JSX.Element => {
    const [kind, setKind] = useState<CommunityAssetKind>('sticker');
    const [assets, setAssets] = useState<CommunityAsset[]>([]);
    const [mine, setMine] = useState<CommunityAsset[]>([]);
    const [name, setName] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [shelf, own] = await Promise.all([
                fetchAssets(kind),
                fetchMyAssets().catch(() => []),
            ]);
            setAssets(shelf);
            setMine(own);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not load assets');
        }
    }, [kind]);

    useEffect(() => {
        void load();
    }, [load]);

    const onSubmit = async () => {
        if (!name.trim() || !mediaUrl.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await submitAsset({ kind, name: name.trim(), mediaUrl: mediaUrl.trim() });
            setName('');
            setMediaUrl('');
            await load();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not submit');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={panel} data-testid="asset-shelf">
            <h1 style={{ margin: 0, fontSize: 18 }}>Made by people here</h1>
            <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Asset kinds">
                {KINDS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={kind === option.id}
                        data-testid={`asset-kind-${option.id}`}
                        onClick={() => setKind(option.id)}
                        style={{
                            border:
                                kind === option.id
                                    ? '1px solid var(--accent-primary)'
                                    : '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '6px 12px',
                            cursor: 'pointer',
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <section style={{ display: 'grid', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Make one</h2>
                {/* Said up front rather than after submitting, so nobody expects
                    their upload to appear immediately. */}
                <small style={{ opacity: 0.8 }}>
                    New submissions are reviewed before they can be shared.
                </small>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    aria-label="Asset name"
                    maxLength={120}
                />
                <input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Image URL (mxc:// or https://)"
                    aria-label="Asset image URL"
                />
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={busy || !name.trim() || !mediaUrl.trim()}
                    data-testid="asset-submit"
                >
                    {busy ? 'Submitting…' : 'Submit for review'}
                </button>
                {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
            </section>

            {mine.length > 0 ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 15 }}>Yours</h2>
                    {mine.map((asset) => (
                        <div key={asset.id} style={card} data-testid="asset-mine-card">
                            <strong>{asset.name}</strong>
                            <small style={{ opacity: 0.8 }}>{STATUS_COPY[asset.status]}</small>
                            {/* A rejection carries its reason so it can be answered. */}
                            {asset.reviewNote ? (
                                <small style={{ opacity: 0.9 }}>“{asset.reviewNote}”</small>
                            ) : null}
                            {asset.foundingOrdinal !== null ? (
                                <small style={{ opacity: 0.8 }}>
                                    #{asset.foundingOrdinal} of this kind
                                </small>
                            ) : null}
                        </div>
                    ))}
                </section>
            ) : null}

            <section style={{ display: 'grid', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Shelf</h2>
                {assets.length === 0 ? (
                    <small style={{ opacity: 0.8 }} data-testid="asset-shelf-empty">
                        Nothing here yet. Whatever gets made first will be.
                    </small>
                ) : (
                    assets.map((asset) => (
                        <div key={asset.id} style={card} data-testid="asset-card">
                            <strong>{asset.name}</strong>
                            {asset.description ? (
                                <small style={{ opacity: 0.85 }}>{asset.description}</small>
                            ) : null}
                        </div>
                    ))
                )}
            </section>
        </div>
    );
};

export default AssetShelf;
