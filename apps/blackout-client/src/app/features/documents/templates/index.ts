/**
 * Founding-document seed templates.
 *
 * v1 ships short, plain-language seeds that point cooperatives at the
 * canonical source material rather than reproducing it in-app. Each entry
 * cites its license and the upstream library so the playbook reveal
 * screen can attribute the source.
 *
 * Upstream sources (all permissively published for reuse):
 *   • SELC — Sustainable Economies Law Center, Legal Resource Library
 *   • USFWC — US Federation of Worker Cooperatives, bylaws templates
 *   • CFL — Center for Family Life, parent-coop preschool docs
 *
 * Legal review before shipping production text is a parallel content
 * task; the protocol surface is in place so the swap is data-only.
 */

import type { PlaybookId } from '@blackout/protocol';

export interface DocumentTemplate {
    /** Stable id used as `derivedFromTemplateId` on the seeded doc. */
    id: string;
    title: string;
    body: string;
    /** Source attribution + license note for the reveal screen. */
    attribution: string;
}

const ATTRIB_SELC = 'Seed adapted from the SELC Legal Resource Library (CC BY-SA).';
const ATTRIB_USFWC = 'Seed adapted from USFWC worker-co-op bylaws templates (CC BY-SA).';
const ATTRIB_CFL = 'Seed adapted from the Center for Family Life parent-coop documents (CC BY-NC).';

const BYLAWS_SELC: DocumentTemplate = {
    id: 'bylaws-selc',
    title: 'Bylaws',
    body: [
        '# Bylaws',
        '',
        '## 1. Purpose',
        'We name what this circle exists to do, in plain language. One sentence is enough.',
        '',
        '## 2. Membership',
        '- Who can join, and how.',
        '- Member rights and member responsibilities.',
        '- How a member leaves, and what they take with them.',
        '',
        '## 3. Decision-making',
        'We decide by consent (default for cooperatives): proposals pass unless someone raises a',
        'paramount objection. Concerns are heard before passing.',
        '',
        '## 4. Roles',
        'Roles are term-bound and rotate. Each role has a one-sentence domain — what it has',
        'authority over.',
        '',
        '## 5. Resources',
        'How we hold and account for shared resources. Treasurer keeps a public ledger.',
        '',
        '## 6. Amendment',
        'These bylaws are amended by consent — bring a proposal, hear concerns, try the change.',
        '',
        '---',
        '*Adapted from the SELC Legal Resource Library. Replace this paragraph with your own.*',
    ].join('\n'),
    attribution: ATTRIB_SELC,
};

const MISSION_USFWC: DocumentTemplate = {
    id: 'mission-usfwc',
    title: 'Mission',
    body: [
        '# Mission',
        '',
        'We are [name] — a cooperative of [members] in [place].',
        '',
        'Our purpose is to [...one sentence: what we do, for whom, why].',
        '',
        'We share these values:',
        '- ',
        '- ',
        '- ',
        '',
        'We measure success by [the few concrete things that mean we are doing the work].',
        '',
        '---',
        '*Adapted from USFWC worker-co-op bylaws templates.*',
    ].join('\n'),
    attribution: ATTRIB_USFWC,
};

const DECISION_RULES_USFWC: DocumentTemplate = {
    id: 'decision-rules-usfwc',
    title: 'Decision rules',
    body: [
        '# Decision rules',
        '',
        'How decisions move through this circle:',
        '',
        '1. **Surface** — anyone can name a question. A proposal is welcome.',
        '2. **Round** — facilitator opens a round; every voice is heard before tally.',
        '3. **Consent check** — 🌱 (safe to try), 🌾 (concern, opens an inline note),',
        '   🪨 (paramount objection, opens "what harm?" form).',
        '4. **Pass** — proposal passes when no paramount objection remains *and* consents',
        '   meet quorum at the deadline.',
        '5. **Try** — every decision is a try, not a commitment. Revisit on a regular cadence.',
        '',
        'Things that bypass consent:',
        '- Emergencies that risk safety (the on-call role decides; reviewed afterwards).',
        '- Routine operational calls inside a role&apos;s domain (the role-holder decides).',
        '',
        '---',
        '*Adapted from USFWC worker-co-op bylaws templates.*',
    ].join('\n'),
    attribution: ATTRIB_USFWC,
};

const MUTUAL_AID_AGREEMENT_CFL: DocumentTemplate = {
    id: 'mutual-aid-agreement-cfl',
    title: 'Mutual-aid agreement',
    body: [
        '# Mutual-aid agreement',
        '',
        'This grove exchanges time and care rather than cash.',
        '',
        '## What we offer each other',
        '- Hours of care, with reciprocity tracked by the time bank.',
        '- A starter grant for new members (we begin in trust, not debt).',
        '- A trusted call list for when someone needs help fast.',
        '',
        '## How we keep accounts',
        '- Every exchange logs its hours in the bank.',
        '- Balances are public among members; treasurers may share aggregates with',
        '  partner organizations only with consent.',
        '',
        '## What we won&apos;t do',
        '- Cash-redeem credits (this would change the legal posture).',
        '- Charge interest. Demurrage may be applied so credits keep moving.',
        '',
        '---',
        '*Adapted from the Center for Family Life parent-coop documents.*',
    ].join('\n'),
    attribution: ATTRIB_CFL,
};

export const DOCUMENT_TEMPLATES = {
    'bylaws-selc': BYLAWS_SELC,
    'mission-usfwc': MISSION_USFWC,
    'decision-rules-usfwc': DECISION_RULES_USFWC,
    'mutual-aid-agreement-cfl': MUTUAL_AID_AGREEMENT_CFL,
} as const satisfies Record<string, DocumentTemplate>;

export type DocumentTemplateId = keyof typeof DOCUMENT_TEMPLATES;

/**
 * Per-playbook seed list. Casual playbooks (Hearth) get no seeds.
 * Cooperative playbooks get the canonical trio; Grove additionally seeds
 * a mutual-aid agreement; Order gets a slimmed set (decision rules don&apos;t
 * apply to appointed-leader structures the same way).
 */
const SEEDS: Record<PlaybookId, ReadonlyArray<DocumentTemplateId>> = {
    hearth: [],
    circle: ['mission-usfwc', 'decision-rules-usfwc'],
    grove: ['mission-usfwc', 'decision-rules-usfwc', 'mutual-aid-agreement-cfl'],
    workshop: ['bylaws-selc', 'mission-usfwc', 'decision-rules-usfwc'],
    commons: ['bylaws-selc', 'mission-usfwc', 'decision-rules-usfwc'],
    local: ['bylaws-selc', 'mission-usfwc', 'decision-rules-usfwc'],
    confluence: ['bylaws-selc', 'mission-usfwc'],
    order: ['bylaws-selc', 'mission-usfwc'],
    stream: ['mission-usfwc', 'decision-rules-usfwc'],
};

export function seedDocumentsForPlaybook(
    playbookId: PlaybookId,
): ReadonlyArray<DocumentTemplate> {
    const ids = SEEDS[playbookId] ?? [];
    return ids.map((id) => DOCUMENT_TEMPLATES[id]);
}
