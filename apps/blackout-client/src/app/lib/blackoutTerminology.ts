export const BLACKOUT_TERMS = {
    canopy: {
        singular: 'canopy',
        plural: 'canopies',
        title: 'Canopy',
        titlePlural: 'Canopies',
    },
    den: {
        singular: 'den',
        plural: 'dens',
        title: 'Den',
        titlePlural: 'Dens',
    },
    playbook: {
        singular: 'playbook',
        plural: 'playbooks',
        title: 'Playbook',
        titlePlural: 'Playbooks',
    },
    plant: {
        action: 'Plant',
        modalTitle: 'Plant a new den',
        cta: 'Plant this den',
        custom: 'Custom / Advanced',
        revealLead: 'This looks like a',
    },
    round: {
        singular: 'round',
        plural: 'rounds',
        title: 'Round',
        titlePlural: 'Rounds',
    },
    consent: {
        safeToTry: 'Safe to try',
        concern: 'I have a concern',
        objection: 'Paramount objection',
        blockedHeadline: 'Blocked — needs a circle',
    },
    compost: {
        verb: 'Compost',
        verbProgressive: 'Composting',
        archived: 'Composted',
    },
    garden: {
        view: 'Garden',
        ledgerView: 'Ledger',
    },
    mycelium: {
        layer: 'Mycelium',
        layerDescription: 'Co-op-to-co-op constellation across the federation.',
    },
    matrixDenIdHint: 'Matrix den ID (for example: !room:server)',
} as const;

export type BlackoutGlossaryKey =
    | 'canopy'
    | 'den'
    | 'playbook'
    | 'round'
    | 'compost'
    | 'garden'
    | 'mycelium'
    | 'coalition'
    | 'coliseum'
    | 'deaddrop'
    | 'stego'
    | 'numbersStation'
    | 'townhallSfu';

export const BLACKOUT_GLOSSARY: Readonly<Record<BlackoutGlossaryKey, string>> = Object.freeze({
    canopy: 'A community on Blackout — a group of related rooms (called dens) you can join together.',
    den: 'A room inside a canopy where conversations happen — equivalent to a channel.',
    playbook: 'A reusable guide or template you can apply to a canopy or den.',
    round: 'A time-bounded session of activity (e.g. a game round, sprint, or stage).',
    compost: 'Archiving — sending content to a recoverable but hidden state instead of deleting it.',
    garden: 'The cross-canopy view of work in progress; the opposite of a ledger.',
    mycelium: 'The federation layer linking co-ops across servers.',
    coalition: 'A team or org structure spanning members across canopies.',
    coliseum: 'The competitive-event surface (rankings, brackets, arenas).',
    deaddrop: 'A way to hide ephemeral messages inside images that disappear after delivery.',
    stego: 'Steganography — hiding messages inside other content like images.',
    numbersStation: 'A broadcast surface that distributes short coded messages.',
    townhallSfu: 'A large-format voice/video room backed by an SFU server.',
});

