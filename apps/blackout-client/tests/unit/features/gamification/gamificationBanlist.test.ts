import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    GAMIFICATION_BANLIST,
    GAMIFICATION_BANLIST_RULE_IDS,
    isGamificationBanlistRuleId,
} from '@blackout/protocol';

/**
 * Canonical, repo-wide enforcement of the gamification banlist.
 *
 * Two halves:
 *  1. The banlist constant is the single source of truth — lock its rule set so
 *     adding/removing a rule is a deliberate, reviewed change.
 *  2. Scan every cooperative surface for the banned implementation patterns so a
 *     future edit that smuggles in a leaderboard, an XP-for-contribution hook, a
 *     reputation write, or streak/guilt machinery fails loudly here.
 */

describe('GAMIFICATION_BANLIST constant', () => {
    it('exposes the expected, stable rule set', () => {
        expect([...GAMIFICATION_BANLIST_RULE_IDS].sort()).toEqual(
            [
                'aggregate-not-individual',
                'forgiveness-over-punishment',
                'identity-not-status',
                'no-governance-trade',
                'no-guilt-notifications',
                'no-manufactured-urgency',
                'no-monetized-loss-recovery',
                'opt-in-comparison',
            ].sort(),
        );
    });

    it('every rule is fully specified with a unique id', () => {
        const ids = new Set<string>();
        for (const rule of GAMIFICATION_BANLIST) {
            expect(isGamificationBanlistRuleId(rule.id)).toBe(true);
            expect(rule.title.length).toBeGreaterThan(0);
            expect(rule.rule.length).toBeGreaterThan(0);
            expect(rule.rationale.length).toBeGreaterThan(0);
            expect(ids.has(rule.id)).toBe(false);
            ids.add(rule.id);
        }
        expect(ids.size).toBe(GAMIFICATION_BANLIST_RULE_IDS.length);
    });
});

// tests/unit/features/gamification -> apps/blackout-client
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const src = join(appRoot, 'src', 'app');

/** Cooperative surfaces governed by the banlist. */
const SURFACES = [
    join(src, 'features', 'objectives'),
    join(src, 'features', 'playbook', 'party'),
    join(src, 'components', 'thermometer'),
    join(src, 'features', 'governance', 'TreasuryMilestones.tsx'),
    join(src, 'features', 'governance', 'treasuryProgress.ts'),
];

const collectFiles = (path: string): string[] => {
    const stat = statSync(path);
    if (stat.isFile()) return [path];
    return readdirSync(path)
        .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
        .map((name) => join(path, name));
};

/**
 * Strip comments before scanning so the guard checks *code*, not prose. The
 * banlist is deliberately described in JSDoc on these very files ("no
 * leaderboards", "no per-member ranking"); those descriptions must not trip
 * the scan — only an actual implementation should.
 */
const stripComments = (text: string): string =>
    text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');

const sources = SURFACES.flatMap(collectFiles).map((file) => ({
    file,
    text: stripComments(readFileSync(file, 'utf8')),
}));

const offendersFor = (pattern: RegExp): string[] =>
    sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file);

describe('cooperative surfaces honor the banlist', () => {
    it('award no reputation/XP (no-governance-trade, identity-not-status)', () => {
        expect(
            offendersFor(/recordReputationEvent|reputationStore|aggregateReputation|awardXp|grantXp|xpForContribution/),
        ).toEqual([]);
    });

    it('derive no per-member ranking (aggregate-not-individual, opt-in-comparison)', () => {
        expect(
            offendersFor(/leaderboard|rankBy|topContributor|sort\w*\(.*(contributor|sender)/i),
        ).toEqual([]);
    });

    it('ship no streak/guilt/loss machinery (no-manufactured-urgency, no-guilt-notifications)', () => {
        expect(
            offendersFor(/streakFreeze|streakAnxiety|daysMissed|guiltNotif|countdownPenalty|monetiz\w*Recovery/i),
        ).toEqual([]);
    });
});
