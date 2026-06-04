import React, { type ReactNode } from 'react';
import type { CoalitionTabId } from '@blackout/core';
import { GlossaryTerm } from '../../lib/GlossaryTerm';

/**
 * One-line, migrant-friendly explainers for each Coalition tab. Rendered in a
 * lingering {@link FeatureGuide} strip so newcomers always have context for what
 * a tab does and how to add to it.
 */
export const COALITION_TAB_GUIDES: Record<CoalitionTabId, ReactNode> = {
    chat: (
        <>
            Live conversation for this <GlossaryTerm term="den">den</GlossaryTerm> — like a channel.
            Type below to post.
        </>
    ),
    video: <>Short clips for your community. Record or upload to share with the group.</>,
    map: (
        <>
            Nearby events, mutual-aid, and vendors on one map. Use <strong>➕ Post aid</strong> to
            offer or request help.
        </>
    ),
    events: (
        <>
            Community gatherings with RSVPs, volunteer slots, and ride-sharing. Hit{' '}
            <strong>+ New event</strong> to create one.
        </>
    ),
    rings: (
        <>
            Your trusted circles, crews, and guilds — instead of follower counts. Tap{' '}
            <strong>+ New ring</strong>, then invite people to join.
        </>
    ),
    shop: <>The community marketplace. List items for sale or browse local vendors.</>,
    tasks: (
        <>
            A shared board (to&#8209;do → doing → done). Add a task and move it forward as work gets
            done.
        </>
    ),
    needs: (
        <>
            What this coalition is looking for — compost, seedlings, a creator, a developer. Post a
            need and mark it fulfilled when the community comes through.
        </>
    ),
    projects: (
        <>
            Concrete initiatives the coalition is building — gardens, tool libraries, food and
            open-source projects. Launch one and move it from proposed to complete.
        </>
    ),
    resources: (
        <>
            Shared gear the coalition can offer — greenhouses, CNC machines, 3D printers, kitchens,
            tools. Register a resource and keep its availability current.
        </>
    ),
    kits: <>Set up your space in one tap with a ready-made bundle of tabs and tools.</>,
    documents: <>Shared files and pinned references for this den, kept in one place.</>,
    ai: <>AI helpers for this den — summaries, drafting, and other assistive tools.</>,
};
