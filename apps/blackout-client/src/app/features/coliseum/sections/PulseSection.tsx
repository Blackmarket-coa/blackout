import React, { useMemo } from 'react';
import type { RankedColiseumArgument } from '@blackout/core';
import * as ui from '../components/coliseumUi.css';
import * as css from '../TopicPage.css';

export interface PulseSectionProps {
    args: RankedColiseumArgument[];
    /** Present once the community verdict has resolved. */
    winningArgumentId?: string | null;
}

/**
 * Where the topic stands right now: how many people have weighed in, how the
 * stances split, and whether a verdict has landed. Cheap to compute — it is all
 * derived from arguments already loaded — and it is what makes the page feel
 * alive rather than like a static article.
 */
export function PulseSection({ args, winningArgumentId }: PulseSectionProps) {
    const stats = useMemo(() => {
        const voices = new Set(args.map((argument) => argument.authorId));
        const counts = { for: 0, against: 0, nuance: 0 };
        args.forEach((argument) => {
            counts[argument.stance] += 1;
        });
        return { voices: voices.size, counts };
    }, [args]);

    if (args.length === 0) return null;

    return (
        <section className={`${ui.card} ${css.section}`} id="topic-pulse" data-testid="topic-pulse">
            <h2 className={css.sectionHeading}>Pulse</h2>
            <div className={css.pulseRow}>
                <div className={css.pulseStat}>
                    <span className={css.pulseValue}>{args.length}</span>
                    <span className={css.pulseLabel}>Argument{args.length === 1 ? '' : 's'}</span>
                </div>
                <div className={css.pulseStat}>
                    <span className={css.pulseValue}>{stats.voices}</span>
                    <span className={css.pulseLabel}>Voice{stats.voices === 1 ? '' : 's'}</span>
                </div>
                <div className={css.pulseStat}>
                    <span
                        className={css.pulseValue}
                        style={{ color: 'var(--stance-for, #1ABC9C)' }}
                    >
                        {stats.counts.for}
                    </span>
                    <span className={css.pulseLabel}>For</span>
                </div>
                <div className={css.pulseStat}>
                    <span
                        className={css.pulseValue}
                        style={{ color: 'var(--stance-against, #E74C3C)' }}
                    >
                        {stats.counts.against}
                    </span>
                    <span className={css.pulseLabel}>Against</span>
                </div>
                <div className={css.pulseStat}>
                    <span
                        className={css.pulseValue}
                        style={{ color: 'var(--stance-nuance, #F1C40F)' }}
                    >
                        {stats.counts.nuance}
                    </span>
                    <span className={css.pulseLabel}>Nuance</span>
                </div>
            </div>
            <span className={ui.mutedText} data-testid="topic-pulse-verdict">
                {winningArgumentId
                    ? '🏆 A community verdict has landed — see Arguments.'
                    : 'No verdict yet. Consensus is measured across voter clusters, so a broadly acceptable argument can win without dominating any one faction.'}
            </span>
        </section>
    );
}

export default PulseSection;
