import React from 'react';
import type { PickerDecisions } from '../../../../lib/bmc-core';
import { QuestionCardList, type QuestionOption } from './QuestionCard';

/**
 * Q2 — How does our group prefer to make decisions?
 *
 * The brief is firm that this is not "Choose your governance model." Each
 * option is a familiar group posture, framed in plain-language consequences
 * the user can imagine themselves doing on a Tuesday night. "Just hang out"
 * is a first-class option — casual dens are casual, and the picker never
 * promotes them out of that.
 *
 * The brief also insists that authoritarian structures are first-class —
 * a surgical team, a religious order, a traditional firm need their shape
 * supported. "One trusted person decides" is the entry point to Order.
 */
const DECISION_OPTIONS: ReadonlyArray<QuestionOption<PickerDecisions>> = [
    {
        value: 'all_agree',
        title: 'We all need to agree',
        helper:
            'Decisions surface as consent checks. Anyone can raise a concern; nothing moves forward until concerns have been heard.',
    },
    {
        value: 'all_vote',
        title: 'We all vote, majority wins',
        helper:
            'Bigger questions go to a vote of the whole room. Useful when the group is large enough that finding unanimous agreement is impractical.',
    },
    {
        value: 'few_elected',
        title: 'We elect a few people to decide',
        helper:
            'Stewards or delegates carry the room’s authority for a term. Elections happen as normal rounds inside the den.',
    },
    {
        value: 'one_trusted',
        title: 'One trusted person decides',
        helper:
            'Useful when expertise or chain-of-command matters — a surgical team, a traditional firm, an organization with an appointed leader.',
    },
    {
        value: 'just_hang_out',
        title: 'We just hang out',
        helper:
            'No decisions to make yet. We can always grow into a different shape later — every setting here is a try, not a commitment.',
    },
];

interface QuestionDecisionsProps {
    value?: PickerDecisions;
    onSelect: (value: PickerDecisions) => void;
    disabled?: boolean;
}

export function QuestionDecisions({ value, onSelect, disabled }: QuestionDecisionsProps) {
    return (
        <QuestionCardList
            options={DECISION_OPTIONS}
            selected={value}
            onSelect={onSelect}
            disabled={disabled}
        />
    );
}
