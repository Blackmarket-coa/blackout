import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Machine-checked System-5 banlist for the objectives feature.
 *
 * The shared-objective mechanic must stay "personal not comparative, identity-
 * forming not status-conferring." These tests turn that prose constraint into
 * an invariant: contributing must never award XP/reputation, and the feature
 * must never derive a per-member ranking. If a future edit wires objectives to
 * the reputation ledger or a leaderboard, this suite fails loudly.
 */

const here = dirname(fileURLToPath(import.meta.url));
// tests/unit/features/objectives -> apps/blackout-client
const appRoot = join(here, '..', '..', '..', '..');
const featureDir = join(appRoot, 'src', 'app', 'features', 'objectives');

const readFeatureSources = (): Array<{ file: string; text: string }> =>
    readdirSync(featureDir)
        .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
        .map((name) => ({ file: name, text: readFileSync(join(featureDir, name), 'utf8') }));

describe('objectives feature banlist', () => {
    it('awards no reputation/XP — never touches the reputation write path', () => {
        const offenders = readFeatureSources().filter(({ text }) =>
            /recordReputationEvent|reputationStore|REPUTATION_EVENT|aggregateReputation/.test(text),
        );
        expect(offenders.map((o) => o.file)).toEqual([]);
    });

    it('derives no per-member ranking — no sort by contributor', () => {
        const offenders = readFeatureSources().filter(({ text }) =>
            /leaderboard|contributorId.*sort|sort.*contributorId|rankBy|topContributor/i.test(text),
        );
        expect(offenders.map((o) => o.file)).toEqual([]);
    });

    it('does not award badges/levels for contributing', () => {
        const offenders = readFeatureSources().filter(({ text }) =>
            /awardBadge|grantBadge|partyLevel|\bxpGain\b/i.test(text),
        );
        expect(offenders.map((o) => o.file)).toEqual([]);
    });
});
