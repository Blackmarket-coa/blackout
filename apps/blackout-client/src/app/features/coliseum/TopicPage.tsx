import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSetAtom } from 'jotai';
import { EmptyState } from '@blackout/ui/primitives';
import type { ColiseumMatch } from '@blackout/core';
import { COLISEUM_PATH } from '../../pages/paths';
import { selectedColiseumMatchIdAtom, selectedColiseumTopicIdAtom } from '../../state/coliseum';
import { useColiseumTopic, useColiseumVerdict } from './hooks/useColiseumTopics';
import { fetchColiseumMatches } from './coliseumMatchClient';
import { coliseumArenaTheme } from './coliseumArenaTheme.css';
import PropositionSection from './sections/PropositionSection';
import PulseSection from './sections/PulseSection';
import DebateTab from './tabs/DebateTab';
import MatchTab from './tabs/MatchTab';
import LiveTab from './tabs/LiveTab';
import SourcesTab from './tabs/SourcesTab';
import { cx } from './components/cx';
import * as ui from './components/coliseumUi.css';
import * as css from './TopicPage.css';

type SectionId = 'proposition' | 'arguments' | 'match' | 'live' | 'sources';

const SECTION_LABELS: Record<SectionId, string> = {
    proposition: 'Topic',
    arguments: 'Arguments',
    match: 'Match',
    live: 'Live',
    sources: 'Sources',
};

/**
 * A single topic, seen from every angle it supports.
 *
 * Arena, Match, Shouts and Sources used to be peer tabs alongside Topics, which
 * meant the arena's eleven-tab strip ran off the side of a phone and a topic
 * was a selection held in `localStorage` rather than something you could link
 * to. Here they are sections of the topic that produced them, and the topic has
 * a URL.
 *
 * Sections are content-gated: a freshly proposed question is a short, calm page
 * and a resolved match is a rich one. Nothing renders an empty shell.
 */
export function TopicPage() {
    const { topicId = null } = useParams<{ topicId: string }>();
    const navigate = useNavigate();
    const setSelectedTopicId = useSetAtom(selectedColiseumTopicIdAtom);
    const setSelectedMatchId = useSetAtom(selectedColiseumMatchIdAtom);
    const [active, setActive] = useState<SectionId>('proposition');
    const [match, setMatch] = useState<ColiseumMatch | null>(null);

    // The reused section bodies (DebateTab, SourcesTab, LiveTab) read the
    // selected topic from the atom rather than from props, so the route param
    // is the source of truth and the atom follows it.
    useEffect(() => {
        if (topicId) setSelectedTopicId(topicId);
    }, [topicId, setSelectedTopicId]);

    const { data, loading, error } = useColiseumTopic(topicId);
    const { data: verdict } = useColiseumVerdict(topicId);

    // `propositionTopicId` has been stored since matches shipped but nothing
    // ever read it back; this is the join that makes a topic show its fight.
    useEffect(() => {
        if (!topicId) return;
        let cancelled = false;
        fetchColiseumMatches({ propositionTopicId: topicId, limit: 1 })
            .then((response) => {
                if (cancelled) return;
                const found = response.matches[0] ?? null;
                setMatch(found);
                if (found) setSelectedMatchId(found.id);
            })
            .catch(() => {
                // A missing match is the common case, not an error worth
                // surfacing — the section simply does not render.
                if (!cancelled) setMatch(null);
            });
        return () => {
            cancelled = true;
        };
    }, [topicId, setSelectedMatchId]);

    const args = useMemo(() => data?.arguments ?? [], [data]);

    const sections = useMemo<SectionId[]>(() => {
        const visible: SectionId[] = ['proposition'];
        if (args.length > 0) visible.push('arguments');
        if (match) visible.push('match');
        visible.push('live');
        if (args.some((argument) => argument.citations.length > 0)) visible.push('sources');
        return visible;
    }, [args, match]);

    const jumpTo = useCallback((section: SectionId) => {
        setActive(section);
        document.getElementById(`topic-${section}`)?.scrollIntoView({ block: 'start' });
    }, []);

    const back = useCallback(() => navigate(COLISEUM_PATH), [navigate]);

    if (!topicId) return null;

    if (error) {
        return (
            <section className={cx(coliseumArenaTheme, css.root)} data-testid="topic-page">
                <div className={ui.feedColumn}>
                    <EmptyState title="Couldn't load this topic" description={error} />
                </div>
            </section>
        );
    }

    if (loading && !data) {
        return (
            <section className={cx(coliseumArenaTheme, css.root)} data-testid="topic-page">
                <div className={ui.feedColumn} aria-busy="true">
                    <div className={ui.skeleton} style={{ height: 160 }} aria-hidden />
                    <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />
                </div>
            </section>
        );
    }

    if (!data) return null;

    return (
        <section className={cx(coliseumArenaTheme, css.root)} data-testid="topic-page">
            <div className={css.backBar}>
                <button
                    type="button"
                    className={css.backButton}
                    aria-label="Back to Coliseum"
                    data-testid="topic-page-back"
                    onClick={back}
                >
                    ←
                </button>
                <span className={css.backTitle}>{data.topic.title}</span>
            </div>

            <nav className={css.sectionRail} aria-label="Topic sections">
                {sections.map((section) => (
                    <button
                        key={section}
                        type="button"
                        className={cx(css.sectionLink, section === active && css.sectionLinkActive)}
                        onClick={() => jumpTo(section)}
                        data-topic-section={section}
                        data-testid={`topic-section-${section}`}
                    >
                        {SECTION_LABELS[section]}
                    </button>
                ))}
            </nav>

            <div className={css.body}>
                <div className={ui.feedColumn}>
                    <PropositionSection topic={data.topic} args={args} />
                    <PulseSection
                        args={args}
                        winningArgumentId={verdict?.verdict?.winningArgumentId ?? null}
                    />
                </div>

                {sections.includes('arguments') ? (
                    <div id="topic-arguments" className={css.section}>
                        <DebateTab />
                    </div>
                ) : null}

                {sections.includes('match') ? (
                    <div id="topic-match" className={css.section} data-testid="topic-match">
                        <MatchTab />
                    </div>
                ) : null}

                <div id="topic-live" className={css.section} data-testid="topic-live">
                    <LiveTab />
                </div>

                {sections.includes('sources') ? (
                    <div id="topic-sources" className={css.section} data-testid="topic-sources">
                        <SourcesTab />
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export default TopicPage;
