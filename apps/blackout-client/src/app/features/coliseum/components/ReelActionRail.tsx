import React from 'react';
import type { RankedColiseumArgument } from '@blackout/core';
import { cx } from './cx';
import * as css from '../tabs/reel.css';

function ThumbUpIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2 10h4v11H2zM22 11c0-1.1-.9-2-2-2h-5.2l.8-4.1c.1-.6-.1-1.2-.5-1.6L14 2 8.6 8.1c-.4.4-.6.9-.6 1.4V19c0 1.1.9 2 2 2h7.5c.8 0 1.5-.5 1.8-1.2l2.5-6c.1-.2.2-.5.2-.8v-2z" />
        </svg>
    );
}

function ThumbDownIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M22 14h-4V3h4zM2 13c0 1.1.9 2 2 2h5.2l-.8 4.1c-.1.6.1 1.2.5 1.6L10 22l5.4-6.1c.4-.4.6-.9.6-1.4V5c0-1.1-.9-2-2-2H6.5c-.8 0-1.5.5-1.8 1.2l-2.5 6c-.1.2-.2.5-.2.8v2z" />
        </svg>
    );
}

function CommentIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
    );
}

function ShareIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M14 9V5l8 7-8 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
        </svg>
    );
}

/**
 * TikTok-style vertical action rail: agree/disagree with the live support
 * score, jump into the debate thread, and share.
 */
export function ReelActionRail({
    argument,
    onVote,
    onOpenDebate,
    onShare,
}: {
    argument: RankedColiseumArgument;
    onVote: (argumentId: string, direction: 'up' | 'down') => void;
    onOpenDebate?: () => void;
    onShare?: () => void;
}) {
    const supportPct = Math.round(argument.voteScore * 100);
    return (
        <div className={css.rail} data-testid="coliseum-reel-rail">
            <button
                type="button"
                className={css.railButton}
                data-testid={`coliseum-reel-vote-up-${argument.id}`}
                aria-label="Agree"
                onClick={() => onVote(argument.id, 'up')}
            >
                <span className={cx(css.railIcon)}>
                    <ThumbUpIcon />
                </span>
                <span className={css.railLabel}>{supportPct}%</span>
            </button>
            <button
                type="button"
                className={css.railButton}
                data-testid={`coliseum-reel-vote-down-${argument.id}`}
                aria-label="Disagree"
                onClick={() => onVote(argument.id, 'down')}
            >
                <span className={css.railIcon}>
                    <ThumbDownIcon />
                </span>
                <span className={css.railLabel}>Disagree</span>
            </button>
            {onOpenDebate ? (
                <button
                    type="button"
                    className={css.railButton}
                    data-testid={`coliseum-reel-rail-debate-${argument.id}`}
                    aria-label="Open debate thread"
                    onClick={onOpenDebate}
                >
                    <span className={css.railIcon}>
                        <CommentIcon />
                    </span>
                    <span className={css.railLabel}>Debate</span>
                </button>
            ) : null}
            {onShare ? (
                <button
                    type="button"
                    className={css.railButton}
                    data-testid={`coliseum-reel-rail-share-${argument.id}`}
                    aria-label="Share"
                    onClick={onShare}
                >
                    <span className={css.railIcon}>
                        <ShareIcon />
                    </span>
                    <span className={css.railLabel}>Share</span>
                </button>
            ) : null}
        </div>
    );
}

export default ReelActionRail;
