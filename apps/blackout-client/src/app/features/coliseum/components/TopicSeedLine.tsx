import React from 'react';
import { resolveTopicSeed, type ColiseumNewsAnchor, type ColiseumTopicSeed } from '@blackout/core';
import * as ui from './coliseumUi.css';

export interface TopicSeedLineProps {
    /**
     * Optional because the client and the API deploy independently: a server
     * that predates seeds returns topics carrying only `newsAnchor`, and a
     * missing seed must degrade rather than blank the debate.
     */
    seed?: ColiseumTopicSeed;
    /** Legacy anchor, used to reconstruct a link seed when `seed` is absent. */
    newsAnchor?: ColiseumNewsAnchor;
    /**
     * Suppress the click-through on a link seed. Set when the line sits inside
     * a button (a feed card), where a nested anchor would swallow the tap.
     */
    inert?: boolean;
}

const LABEL: Record<ColiseumTopicSeed['kind'], string> = {
    text: '💬 Open question',
    link: '📰',
    media: '🎥 Video take',
    challenge: '⚔️ Challenge',
};

/**
 * One compact line describing how a topic was proposed, rendered under its
 * title wherever a topic appears in a list.
 *
 * A `text` seed is the interesting case: it has nothing to show but the title
 * itself, which is exactly the point — asking a bare question used to be
 * impossible because a headline and source URL were both required.
 */
export function TopicSeedLine({ seed: seedProp, newsAnchor, inert = false }: TopicSeedLineProps) {
    const seed = resolveTopicSeed({ seed: seedProp, newsAnchor });

    if (seed.kind === 'link') {
        const label = `📰 ${seed.headline}`;
        if (inert) {
            return (
                <span className={ui.mutedLink} data-testid="topic-seed-link">
                    {label}
                </span>
            );
        }
        return (
            <a
                href={seed.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className={ui.mutedLink}
                data-testid="topic-seed-link"
            >
                {label}
            </a>
        );
    }

    if (seed.kind === 'media') {
        return (
            <span className={ui.mutedText} data-testid="topic-seed-media">
                {seed.media.kind === 'image' ? '🖼 Image take' : LABEL.media}
            </span>
        );
    }

    if (seed.kind === 'challenge') {
        return (
            <span className={ui.mutedText} data-testid="topic-seed-challenge">
                {seed.opponentId ? `⚔️ Challenge to ${seed.opponentId}` : '⚔️ Open challenge'}
            </span>
        );
    }

    return (
        <span className={ui.mutedText} data-testid="topic-seed-text">
            {LABEL.text}
        </span>
    );
}

export default TopicSeedLine;
