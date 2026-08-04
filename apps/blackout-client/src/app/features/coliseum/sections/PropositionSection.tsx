import React from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    resolveTopicSeed,
    type ColiseumTopic,
    type RankedColiseumArgument,
} from '@blackout/core';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { HeatBadge } from '../components/HeatBadge';
import { RelativeTime } from '../components/RelativeTime';
import { StanceBar } from '../components/StanceBar';
import * as ui from '../components/coliseumUi.css';
import * as css from '../TopicPage.css';

export interface PropositionSectionProps {
    topic: ColiseumTopic;
    args: RankedColiseumArgument[];
}

/**
 * The topic as it was proposed, rendered in whatever form it arrived: a player
 * for a video take, the article card for a link, the bare question for text,
 * the callout for a challenge.
 */
export function PropositionSection({ topic, args }: PropositionSectionProps) {
    const mx = useMatrixClientOrNull();
    const seed = resolveTopicSeed(topic);
    const categoryLabel = COLISEUM_TOPIC_CATEGORIES.find(
        (category) => category.key === topic.category
    )?.label;

    return (
        <section
            className={`${ui.card} ${css.section}`}
            id="topic-proposition"
            data-testid="topic-proposition"
        >
            <div className={ui.cardHeaderRow}>
                <HeatBadge heat={topic.debateHeat} />
                {categoryLabel ? <span className={ui.tagChip}>{categoryLabel}</span> : null}
                <span className={ui.tagChip} style={{ textTransform: 'uppercase' }}>
                    {topic.status}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                    <RelativeTime timestamp={topic.createdAt} />
                </span>
            </div>

            <h1 className={css.propositionTitle}>{topic.title}</h1>

            {seed.kind === 'link' ? (
                <a
                    href={seed.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ui.mutedLink}
                    data-testid="topic-proposition-link"
                >
                    📰 {seed.headline}
                </a>
            ) : null}

            {seed.kind === 'media' && mx
                ? (() => {
                      const src = mxcUrlToHttp(mx, seed.media.mxc, true);
                      if (!src) return null;
                      if (seed.media.kind === 'image') {
                          return (
                              <img
                                  className={css.seedImage}
                                  src={src}
                                  alt={topic.title}
                                  data-testid="topic-proposition-image"
                              />
                          );
                      }
                      const poster = seed.media.posterMxc
                          ? mxcUrlToHttp(mx, seed.media.posterMxc, true) ?? undefined
                          : undefined;
                      return (
                          <video
                              className={css.seedVideo}
                              src={src}
                              poster={poster}
                              controls
                              playsInline
                              preload="metadata"
                              data-testid="topic-proposition-video"
                          />
                      );
                  })()
                : null}

            {seed.kind === 'challenge' ? (
                <p
                    className={ui.mutedText}
                    style={{ margin: 0 }}
                    data-testid="topic-proposition-challenge"
                >
                    {seed.opponentId
                        ? `⚔️ Called out ${seed.opponentId}`
                        : '⚔️ Open challenge — any taker can accept'}
                </p>
            ) : null}

            {args.length > 0 ? <StanceBar items={args} /> : null}

            {topic.tags.length > 0 ? (
                <div className={ui.tagRow}>
                    {topic.tags.slice(0, 8).map((tag) => (
                        <span key={tag} className={ui.tagChip}>
                            #{tag}
                        </span>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

export default PropositionSection;
