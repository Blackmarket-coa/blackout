import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { ProductRatingSummary, ProductReview, ProductVersion } from '@blackout/core';
import {
    fetchProductReviews,
    fetchProductVersions,
    postProductReview,
} from './productReviewsClient';

export interface ProductReviewsPanelProps {
    providerId: string;
    listingId: string;
}

const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-surface, rgba(255,255,255,0.03))',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
};

const stars = (rating: number): string => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));

export function ProductReviewsPanel({ providerId, listingId }: ProductReviewsPanelProps): JSX.Element {
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [summary, setSummary] = useState<ProductRatingSummary | null>(null);
    const [versions, setVersions] = useState<ProductVersion[]>([]);
    const [rating, setRating] = useState(5);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(() => {
        fetchProductReviews(providerId, listingId)
            .then((res) => {
                setReviews(res.reviews);
                setSummary(res.summary);
            })
            .catch(() => setError('Could not load reviews'));
        fetchProductVersions(providerId, listingId)
            .then((res) => setVersions(res.versions))
            .catch(() => undefined);
    }, [providerId, listingId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const submit = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            await postProductReview(providerId, listingId, rating, body.trim() || undefined);
            setBody('');
            refetch();
        } catch {
            setError('Could not submit review');
        } finally {
            setBusy(false);
        }
    }, [providerId, listingId, rating, body, busy, refetch]);

    return (
        <section style={panelStyle} data-testid="product-reviews-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>Reviews</strong>
                {summary ? (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                        {summary.count > 0
                            ? `${summary.average.toFixed(1)} ★ · ${summary.count} review${summary.count === 1 ? '' : 's'}`
                            : 'No reviews yet'}
                    </span>
                ) : null}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    value={rating}
                    onChange={(event) => setRating(Number(event.target.value))}
                    aria-label="Your rating"
                    style={{
                        padding: 6,
                        borderRadius: 8,
                        border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
                        background: 'var(--bg-input, rgba(0,0,0,0.2))',
                        color: 'var(--text-primary, #fff)',
                    }}
                >
                    {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>
                            {stars(value)}
                        </option>
                    ))}
                </select>
                <input
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Share your experience (optional)"
                    data-testid="product-review-body"
                    style={{
                        flex: 1,
                        minWidth: 160,
                        padding: 6,
                        borderRadius: 8,
                        border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
                        background: 'var(--bg-input, rgba(0,0,0,0.2))',
                        color: 'var(--text-primary, #fff)',
                    }}
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Submit
                </button>
            </div>

            {error ? <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 12 }}>{error}</span> : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reviews.map((review) => (
                    <div key={review.id} style={rowStyle} data-testid="product-review">
                        <span style={{ fontSize: 13 }}>
                            {stars(review.rating)}{' '}
                            <span style={{ color: 'var(--text-secondary, #aaa)' }}>{review.authorId}</span>
                        </span>
                        {review.body ? <span style={{ fontSize: 13 }}>{review.body}</span> : null}
                    </div>
                ))}
            </div>

            {versions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <strong style={{ fontSize: 13 }}>Version history</strong>
                    {versions.map((version) => (
                        <div key={version.id} style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
                            <strong style={{ color: 'var(--text-primary, #fff)' }}>{version.version}</strong>
                            {version.notes ? ` — ${version.notes}` : ''}
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

export default ProductReviewsPanel;
