import React from 'react';
import type { PickerSize } from '../../../../lib/bmc-core';
import { QuestionCardList, type QuestionOption } from './QuestionCard';

/**
 * Q1 — How many of us are in this den?
 *
 * Copy avoids exact counts; the brief specifies that numbers stay hidden until
 * after selection. The helper text gestures at scale through familiar
 * gathering imagery (kitchen table → fire → market square → constellation of
 * villages) per the brief's hand-drawn-illustrations direction.
 *
 * TODO(plan/B): replace the SequenceCard's leading icon slot with bespoke
 * solarpunk SVGs from public/res/svg/playbook/q1-size-{trio|small|medium|constellation}.svg
 * when those assets land. The component already passes through `leadingIcon`.
 */
const SIZE_OPTIONS: ReadonlyArray<QuestionOption<PickerSize>> = [
    {
        value: 'trio',
        title: 'A few of us',
        helper:
            'Three or four people coordinating something small — a household, a study group, a duo of friends with a shared project.',
    },
    {
        value: 'small',
        title: 'A handful',
        helper:
            "Under a dozen, and everyone knows each other. Most affinity groups and small co-ops sit here.",
    },
    {
        value: 'medium',
        title: 'A workplace or congregation',
        helper:
            'Between a dozen and a hundred. Worker co-ops, tenant unions, parent-cooperative preschools, neighborhood councils.',
    },
    {
        value: 'constellation',
        title: 'A federation of groups',
        helper:
            'Many groups working in parallel, sending delegates to talk to each other. At this scale, delegation is the only thing that scales.',
    },
];

interface QuestionSizeProps {
    value?: PickerSize;
    onSelect: (value: PickerSize) => void;
    disabled?: boolean;
}

export function QuestionSize({ value, onSelect, disabled }: QuestionSizeProps) {
    return (
        <QuestionCardList
            options={SIZE_OPTIONS}
            selected={value}
            onSelect={onSelect}
            disabled={disabled}
        />
    );
}
