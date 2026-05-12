import React from 'react';
import type { PickerResources } from '../../../../lib/bmc-core';
import { QuestionCardList, type QuestionOption } from './QuestionCard';

/**
 * Q3 — What's our relationship to shared resources?
 *
 * The treasury feature flag and the Garden view both follow from this answer.
 * The kitty / treasury / legal-entity ladder is deliberately ordered by the
 * weight of accountability, not by the amount of money — a household kitty is
 * lighter than a chartered non-profit even when the dollar sums are similar.
 */
const RESOURCE_OPTIONS: ReadonlyArray<QuestionOption<PickerResources>> = [
    {
        value: 'no_money',
        title: "We don't share money",
        helper:
            'No treasury, no buckets. Coordination only. You can add a kitty later if the group wants one.',
    },
    {
        value: 'kitty',
        title: 'We chip into a shared kitty',
        helper:
            'Small things — snacks, supplies, a recurring rental. A lightweight ledger is enough; no accounting overhead.',
    },
    {
        value: 'treasury',
        title: 'We pool time or money in a real treasury',
        helper:
            'Real balances, real transactions, member buckets and snapshots. Treasurers and auditors get a clean ledger view.',
    },
    {
        value: 'legal_entity',
        title: 'We are (or will be) a legal entity',
        helper:
            'A co-op, a non-profit, a partnership, a firm. Decisions and treasury changes leave an audit trail by default.',
    },
];

interface QuestionResourcesProps {
    value?: PickerResources;
    onSelect: (value: PickerResources) => void;
    disabled?: boolean;
}

export function QuestionResources({ value, onSelect, disabled }: QuestionResourcesProps) {
    return (
        <QuestionCardList
            options={RESOURCE_OPTIONS}
            selected={value}
            onSelect={onSelect}
            disabled={disabled}
        />
    );
}
